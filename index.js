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


var IGNORE_REGEX = /db\/migration|resources\/seo\/assets\//i;

fs.readdir('./repos')
.then(folders => {
	folders = folders.filter(folder => folder.charAt(0) !== '.');
	console.log('reading from ' + folders.join(', '));

	return Promise.all(folders.map(folder => {
		return exec('git pull', {cwd: './repos/'+folder})
		.then(() => {
			return exec('git log --simplify-merges --merges --since=2016-01-28T00:00:00Z-04:00 --format="%H"', {cwd: './repos/'+folder, maxBuffer:10240*1024});
		});
	}))
	.then(getStds)
	.then(commitLists => {
		var commits = commitLists.map(list => {
			list = list.trim().split('\n');
			return list[list.length-1];
		});
		return commits;
	})
	.then(commits => {
		return Promise.all(commits.map((commit, i) => {
			return exec('git log --format="-brk- %H %ae" --numstat '+commit+'..HEAD', {cwd: './repos/'+folders[i], maxBuffer:10240*1024});
		}));
	})
	.then(getStds)
	.then(repos => {
		var results = {};

		repos.forEach(repo => {
			var commits = repo.trim().split('-brk-').filter(a => a.trim());
			commits.forEach(commit => {
				var files = commit.trim().split('\n').filter(a => a.trim());
				var human = files.shift().trim().replace(/[a-f0-9]+\s/g, '');

				files = files.filter(file => {
					return !IGNORE_REGEX.test(file);
				});

				human = names[human] || human;

				var start = results[human] || 0;
				results[human] = files.reduce((acc, file) => {
					var stats = file.split('\t');
					// if it's a binary file we get '-'.
					// this is a fast and harmless way to check both of them.
					if (stats[0] === stats[1]) {
						return acc;
					}
					return acc + (+stats[0]) - (+stats[1]);
				}, start);
			});
		});
		return results;
	});
})
.then((results) => {
	var sortedHumans = Object.keys(results);
	sortedHumans.sort((humanA, humanB) => {
		return results[humanA] - results[humanB];
	});
	console.log('AND THE STANDINGS ARE:');
	sortedHumans.forEach((human, i) => {
		var count = results[human];
		if (count < 0) {
			var str = (i+1) + ' ' + human + ' removed ' + (-count) + ' lines';
			if (i === 0) {
				console.log(str.rainbow);
			} else {
				console.log(str);
			}
		} else if (count === 0) {
			console.log(((i+1) + ' ' + human + ' broke even'));
		} else {
			console.log(((i+1) + ' ' + human + ' added ' + count + ' lines').gray);
		}
	});
})
.catch(err => {
	console.log('ERROR!!');
	console.error(err);
});
