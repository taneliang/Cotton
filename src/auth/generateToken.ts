import { readFileSync } from 'fs';
import * as jwt from 'jsonwebtoken';

function jwtDate(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

// Generate JWT for GitHub App.
// Requires gh_priv_key.pem to be in repo root (i.e. ../..).
// Token docs: https://developer.github.com/apps/building-github-apps/authentication-options-for-github-apps/#authenticating-as-a-github-app
export default function generateGitHubToken() {
  const cert = readFileSync('gh_priv_key.pem');

  const payload = {
    iat: jwtDate(new Date()),
    exp: jwtDate(new Date()) + 100,
    iss: 10823,
  };

  const options = {
    algorithm: 'RS256',
  };

  return jwt.sign(payload, cert, options);
}
