# Cotton

[![Build Status](https://travis-ci.org/taneliang/Cotton.svg?branch=master)](https://travis-ci.org/taneliang/Cotton)
[![Maintainability](https://api.codeclimate.com/v1/badges/2bf75602f99c176b6456/maintainability)](https://codeclimate.com/github/taneliang/Cotton/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/2bf75602f99c176b6456/test_coverage)](https://codeclimate.com/github/taneliang/Cotton/test_coverage)

Cotton is a serverless GitHub app which upgrades dependencies in projects which use Yarn. It is written in Node.js with the Serverless framework.

## Features

- Upgrades all dependencies in a repository in one consolidated PR.
- Updates yarn.lock together with package.json. Projects which do not use yarn are currently unsupported.
- Monorepo support (I haven't actually tried Cotton on actual Yarn monorepos, only monorepos with multiple independent package.json files).
- Manual upgrade trigger (currently unsecured).
- Abort rebase when non-Cotton commits are found to have been pushed to the PR.

### Todo

- Scheduled upgrades.
- Configurable upgrade schedule.

## Architecture

Cotton is deployed on AWS using the Serverless framework. It is comprised of 3 lambdas written as Serverless handlers. They invoke each other using the Amazon Simple Notification Service (SNS), and can also be invoked through their REST API endpoints.

### Handlers

- `upgradeAllInstallations`: upgrades all repos that Cotton is installed on by invoking `upgradeInstallation` for each installation. It can be invoked by the REST API endpoint `/upgradeAllInstallations`
- `upgradeInstallation`: upgrades all repos in an installation by invoking `upgradeRepository` for each repo in the input installation. It can be invoked by the REST API endpoint `/upgradeInstallation/{installationID}`, or through an SNS message on the `upgradeInstallation` topic.
- `upgradeRepository`: upgrades a repository. It can be invoked by the REST API endpoint `/upgradeRepository/{installationID}/{repoOwner}/{repoName}`, e.g. `/upgradeRepository/123456/taneliang/Cotton`, or through an SNS message on the `upgradeRepository` topic.

## Contributing

### Setup

1. Clone this repo.
1. Run `cp .env.example .env` at the repo root.
1. Set up an AWS account if you haven't.
1. Generate `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, following https://serverless.com/framework/docs/providers/aws/guide/credentials/.
1. Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`.
1. Register a new GitHub App, following https://developer.github.com/apps/building-github-apps/creating-a-github-app/. Use dummy urls as required. Permission settings are as followed:
    - Repository contents: R&W
    - Issues: R&W
    - Repo metadata: R
    - PRs: R&W
    - Subscribe to events: Push, Issue comment, PR review, PR review comment
1. Generate (securely, e.g. using a password manager) and set a webhook secret for the new app, and set `GITHUB_WEBHOOK_SECRET` in `.env`.
1. Generate the private key following https://developer.github.com/apps/building-github-apps/authentication-options-for-github-apps/#generating-a-private-key.
1. Download the key into the repo root and rename it "gh_priv_key.pem".
1. Use the Github ID on the app settings page to set `GITHUB_APP_ID` in `.env`.
1. Deploy the app by running `yarn deploy`.
1. Once deployed, Serverless will output a few URLs. Set the GitHub App's Webhook URL to the githubWebhook POST endpoint by Serverless.

### Development

Run `yarn start`. This starts a `serverless-offline` server, which simulates API Gateway locally. Note that the `upgradeAllInstallations` and `upgradeInstallation` handlers will fail to trigger their downstream lambdas as `serverless-offline` does not mock SNS.

### Testing

Run `yarn test`. Tests are written with Jest.

### Deployment

Run `yarn deploy`. This command uses serverless to deploy Cotton to AWS.
