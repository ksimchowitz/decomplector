var fs = require('fs-promise');
var exec = require('child-process-promise').exec;

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

var results = {};

var IGNORE_REGEX = /db\/migration|generated/;

fs.readdir('./repos')
.then(folders => {
	console.log('FOLDERS');
	console.log(folders);

	return Promise.all(folders.map(folder => {
		return exec('git pull', {cwd: './repos/'+folder})
		.then(() => {
			return exec('git log --simplify-merges --merges --since=2016-01-29 --format="%H"', {cwd: './repos/'+folder});
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
			return exec('git log --format="-----break----- %H %ae" --numstat '+commit+'..HEAD', {cwd: './repos/'+folders[i]});
		}));
	})
	.then(getStds)
	.then(repos => {
		repos.forEach(repo => {
			var commits = repo.trim().split('-----break-----').filter(a => a.trim());
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
					return acc + (+stats[0]) - (+stats[1]);
				}, start);
			});
		});
		//repoCommits.forEach()
	})
	.catch(err => {
		console.log('ERROR!!');
		console.error(err);
	});
})
.then(() => {
	var sortedHumans = Object.keys(results);
	sortedHumans.sort((humanA, humanB) => {
		return results[humanA] - results[humanB];
	});
	console.log('AND THE STANDINGS ARE:');
	sortedHumans.forEach((human, i) => {
		console.log( (i+1) + ' ' + human + ' with ' + results[human] + ' lines added');
	});
});
