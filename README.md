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

## Development

### Setup

1. Clone this repo.
2. Set up an AWS account if you haven't.
3. Generate token.
4. `cp .env.example .env`
5. Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`.
6. Register a new GitHub App. Please enter a webhook secret as well.
7. Generate and set a webhook secret for the new app, and set `GITHUB_WEBHOOK_SECRET` in `.env`.
8. Generate and download a private key for the app.
9. Copy the downloaded PEM encoded private key into the repo root. Rename it "gh_priv_key.pem".

### Deployment

Run `yarn deploy`. This command uses serverless to deploy Cotton to AWS.

### Dev

Run `yarn start`. This starts a `serverless-offline` server, which simulates API Gateway locally. Note that the `upgradeAllInstallations` and `upgradeInstallation` handlers will fail to trigger their downstream lambdas as `serverless-offline` does not mock SNS.

### Testing

Run `yarn test`. Tests are written with Jest.
