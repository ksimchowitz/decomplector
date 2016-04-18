var GitHubApi = require('github');
var client;

exports.authenticate = function () {
	if (client) {
		return client;
	}
	client = new GitHubApi({
		// required
		version: '3.0.0',
	});

	client.authenticate({
		type: 'basic',
		username: process.env.GITHUB_USERNAME,
		password: process.env.GITHUB_PASSWORD
	});

	return client;
};

exports.getPRs = function (user, repo) {
	return new Promise(function (resolve, reject) {
		client.pullRequests.getAll({
			user: user,
			repo: repo,
			state: 'closed',
			sort: 'updated',
			direction: 'desc'
		}, function (err, data) {
			if (err) {
				reject(err);
				return;
			}
			resolve(data);
		});
	});
};
