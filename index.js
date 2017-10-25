var fs = require('fs-promise');
var exec = require('child-process-promise').exec;
var moment = require('moment');

var github = require('./github');
github.authenticate();

require('colors');

var names;

try {
	names = require('./names');
} catch (e) {
	names = {};
}

function getStd (result) {
	return result ? result.stdout : null;
}

function getStds (results) {
	return results.map(getStd);
}

var startingDateStr = moment().add(-6, 'days').startOf('day').toISOString(); //'2016-07-20T00:00:00Z';
console.log(startingDateStr);
var endingDateStr = moment().add(1, 'days').startOf('day').toISOString(); //'2099-03-17T00:00:00Z';

var startingDate = new Date(startingDateStr);

var IGNORE_REGEX = /db\/migration|resources\/seo\/assets\/|build\/|dist\/|\.csv$|\.json$|\.lock$|\.md$/ig;
var TESTS_REGEX = /spec\/|tests?\/|sandbox/ig;

fs.readdir('./repos')
// update everything
.then(folders => {
	folders = folders.filter(folder => folder.charAt(0) !== '.');
	console.log('Checking ' + folders.join(', '));
	return Promise.all(folders.map(folder => {
		return exec('git fetch', {cwd: './repos/'+folder})
		.then(() => {
			return exec('git reset --hard origin/HEAD', {cwd: './repos/'+folder});
		});
	}))
	.then(() => folders);
})
// find the repos with changes since the starting date and filter out the ones with none
.then(folders => {
	return Promise.all(folders.map(folder => {
		// this gets any one merge commit since the starting date
		return exec('git log --max-count=1 --after=' + startingDateStr + ' --before=' + endingDateStr + ' --format="%H"', {cwd: './repos/'+folder});
	}))
	.then(getStds)
	.then((stds) => {
		return Promise.all(folders.map((folder, i) => {
			if (stds[i].trim()) {
				return stds[i];
			} else {
				return exec('git log --max-count=1 --after=' + startingDateStr + ' --before=' + endingDateStr + ' --format="%H"', {cwd: './repos/'+folder})
				.then(getStd);
			}
		}))
		.then(next => {
			return folders.filter((folder, i) => next[i].trim());
		});

	});
})
// get all the changes merged into master since the starting date and tally up the results
.then(folders => {
	console.log('Found changes to ' + folders.join(', '));

	return Promise.all(folders.map(folder => {
		return github.getPRs('compstak', folder)
		.then((prs) => {
			//console.log(prs);
			prs.sort((a, b) => a.closed_at < b.closed_at ? -1 : 1);
			prs = prs.filter(pr => pr.base.ref === 'master');
			prs = prs.filter(pr => pr.merged_at !== null);
			prs = prs.filter(pr => new Date(pr.closed_at) > startingDate);
			return {
				folder,
				commit: prs[0] ? prs[0].base.sha : null
			};
		});
		// this gets the last merge commit before the starting date
		//return exec('git log --simplify-merges --merges --max-count=1 --before=' + startingDate + ' --format="%H"', {cwd: './repos/'+folder});
	}))
	// .then(getStds)
	// .then(commits => commits.map(commit => commit.trim()))
	.then(commits => {
		return Promise.all(commits.map((commit, i) => {
			if (!commit.commit) {
				return null;
			}
			// this gets the commits on master that are not on the last merge commit before the starting date
			return exec('git log --format="-brk- %H %ae" --numstat '+commit.commit+'..HEAD', {cwd: './repos/'+folders[i], maxBuffer:10240*1024})
			.then(getStd)
			.then(commits => {
				return {
					folder: commit.folder,
					commits
				};
			});
		}));
	})
	.then(repos => {
		var results = {};
		repos.forEach((repo, i) => {
			if (repo === null) {
				return;
			}
			var commits = repo.commits.trim().split('-brk-').filter(a => a.trim());
			commits.forEach(commit => {
				var files = commit.trim().split('\n').filter(a => a.trim());
				var human = files.shift().trim().replace(/[a-f0-9]+\s/g, '');

				var regularFiles = files.filter(file => file.match(IGNORE_REGEX) === null && file.match(TESTS_REGEX) === null);
				var testFiles = files.filter(file => file.match(TESTS_REGEX) !== null);

				human = names[human] || human;

				human = human.padEnd(12) + repo.folder.padEnd(17);

				results[human] = results[human] || {
					lines: 0,
				};
				results[human].lines = regularFiles.reduce((acc, file) => {
					var stats = file.split('\t');
					// if it's a binary file we get '-'.
					// this is a fast and harmless way to check both of them.
					if (stats[0] === stats[1]) {
						return acc;
					}
					return acc + (+stats[0]) - (+stats[1]);
				}, results[human].lines);

				if (testFiles.length) {
					results[human].testLines = testFiles.reduce((acc, file) => {
						var stats = file.split('\t');
						// if it's a binary file we get '-'.
						// this is a fast and harmless way to check both of them.
						if (stats[0] === stats[1]) {
							return acc;
						}
						return acc + (+stats[0]) - (+stats[1]);
					}, results[human].testLines || 0);
				}
			});
		});
		return results;
	});
})
// print the results
.then((results) => {
	var sortedHumans = Object.keys(results);
	sortedHumans.sort((humanA, humanB) => {
		return results[humanA].lines - results[humanB].lines;
	});
	console.log('THE DECOMPLECTOR STANDINGS ARE:');
	sortedHumans.forEach((human, i) => {
		var count = results[human].lines;
		var number = i.toString().padStart(2);
		if (count < 0) {
			var str = number + ' ' + human + ' removed ' + (-count) + ' lines';
			if (i === 0) {
				console.log(str.rainbow);
			} else {
				console.log(str);
			}
		} else if (count === 0) {
			console.log((number + ' ' + human + ' broke even'));
		} else {
			console.log((number + ' ' + human + ' added ' + count + ' lines').gray);
		}
	});

	console.log('\nTHE TESTING STANDINGS ARE:');
	var testSortedHumans = Object.keys(results);
	testSortedHumans = testSortedHumans.filter(human => results[human].testLines !== undefined);
	testSortedHumans.sort((humanA, humanB) => {
		return results[humanB].testLines - results[humanA].testLines;
	});

	testSortedHumans.forEach((human, i) => {
		var count = results[human].testLines;
		var number = i.toString().padStart(2);
		if (count > 0) {
			var str = number + ' ' + human + ' added ' + (count) + ' lines';
			if (i === 0) {
				console.log(str.rainbow);
			} else {
				console.log(str);
			}
		} else if (count === 0) {
			console.log((number + ' ' + human + ' broke even'));
		} else {
			console.log((number + ' ' + human + ' removed ' + (-count) + ' lines').gray);
		}
	});

})
.catch(err => {
	console.log('ERROR!!');
	console.error(err);
});
