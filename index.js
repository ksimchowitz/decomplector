var fs = require('fs-promise');
var exec = require('child-process-promise').exec;
require('colors');

var names;

try {
	names = require('./names');
} catch (e) {
	names = {};
}

function getStd (result) {
	return result.stdout;
}

function getStds (results) {
	return results.map(getStd);
}

var startingDate = '2016-02-11T00:00:00Z-04:00';

var IGNORE_REGEX = /db\/migration|resources\/seo\/assets\/|\/spec\/|\/tests?\//i;

fs.readdir('./repos')
// update everything
.then(folders => {
	folders = folders.filter(folder => folder.charAt(0) !== '.');
	console.log('Checking ' + folders.join(', '));
	return Promise.all(folders.map(folder => {
		return exec('git pull', {cwd: './repos/'+folder});
	})).then(() => folders);
})
// find the repos with changes since the starting date and filter out the ones with none
.then(folders => {
	return Promise.all(folders.map(folder => {
		// this gets any one merge commit since the starting date
		return exec('git log --simplify-merges --merges --max-count=1 --after=' + startingDate + ' --grep="Merge pull request" --format="%H"', {cwd: './repos/'+folder});
	}))
	.then(getStds)
	.then((stds) => {
		return folders.filter((folder, i) => stds[i].trim());
	});
})
// get all the changes merged into master since the starting date and tally up the results
.then(folders => {
	console.log('Found changes to ' + folders.join(', '));

	return Promise.all(folders.map(folder => {
		// this gets the last merge commit before the starting date
		return exec('git log --simplify-merges --merges --max-count=1 --before=' + startingDate + ' --grep="Merge pull request" --format="%H"', {cwd: './repos/'+folder});
	}))
	.then(getStds)
	.then(commits => commits.map(commit => commit.trim()))
	.then(commits => {
		return Promise.all(commits.map((commit, i) => {
			// this gets the commits on master that are not on the last merge commit before the starting date
			return exec('git log --format="-brk- %H %ae" --numstat '+commit+'..HEAD', {cwd: './repos/'+folders[i], maxBuffer:10240*1024});
		}));
	})
	.then(getStds)
	.then(repos => {
		var results = {};

		repos.forEach((repo, i) => {
			var commits = repo.trim().split('-brk-').filter(a => a.trim());
			commits.forEach(commit => {
				var files = commit.trim().split('\n').filter(a => a.trim());
				var human = files.shift().trim().replace(/[a-f0-9]+\s/g, '');

				files = files.filter(file => {
					return !IGNORE_REGEX.test(file);
				});

				human = names[human] || human;

				results[human] = results[human] || {
					lines: 0,
					repos: []
				};
				results[human].lines = files.reduce((acc, file) => {
					var stats = file.split('\t');
					// if it's a binary file we get '-'.
					// this is a fast and harmless way to check both of them.
					if (stats[0] === stats[1]) {
						return acc;
					}
					return acc + (+stats[0]) - (+stats[1]);
				}, results[human].lines);

				if (results[human].repos.indexOf(folders[i]) === -1) {
					results[human].repos.push(folders[i]);
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
	console.log('AND THE STANDINGS ARE:');
	sortedHumans.forEach((human, i) => {
		var count = results[human].lines;
		var repos = results[human].repos.join(', ');
		if (count < 0) {
			var str = (i+1) + ' ' + human + ' removed ' + (-count) + ' lines (' + repos + ')';
			if (i === 0) {
				console.log(str.rainbow);
			} else {
				console.log(str);
			}
		} else if (count === 0) {
			console.log(((i+1) + ' ' + human + ' broke even (' + repos + ')'));
		} else {
			console.log(((i+1) + ' ' + human + ' added ' + count + ' lines (' + repos + ')').gray);
		}
	});
})
.catch(err => {
	console.log('ERROR!!');
	console.error(err);
});
