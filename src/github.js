/**
 * @license Ticket Tagger automatically predicts and labels issue types.
 * Copyright (C) 2018,2019,2020  Rafael Kallis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * @file github.js
 * @author Rafael Kallis <rk@rafaelkallis.com>
 */

"use strict";

const config = require("./config");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const yaml = require("yaml");
const Joi = require("joi");

/**
 * Signs the payload using the secret.
 * Used for github payload verification.
 *
 * @param {String} opts.payload - The payload to sign.
 * @param {String} opts.secret - The secret used for signing.
 * @returns {String} The payload signature
 */
function sign({ payload, secret, algorithm = "sha256" }) {
  const digest = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest("hex");
  return `${algorithm}=${digest}`;
}

exports.sign = sign;

exports.verifySignature = ({ payload, secret, signature }) =>
  sign({ payload, secret }) === signature;

exports.setLabels = async ({ repository, issue, labels, accessToken }) => {
  return await fetch(`${repository}/issues/${issue}/labels`, {
    method: "PUT",
    headers: {
      Authorization: `token ${accessToken}`,
      "User-Agent": "Ticket-Tagger",
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({ labels }),
  });
};

const repositoryConfigSchema = Joi.object({
  version: Joi.number().allow(3),
  labels: Joi.object().pattern(
    Joi.string().valid("bug", "enhancement", "question"),
    {
      text: Joi.string().length(50),
    }
  ),
});
exports.getRepositoryConfig = async ({ repository, accessToken }) => {
  const url = `${repository}/contents/${config.CONFIG_FILE_PATH}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `token ${accessToken}`,
      "User-Agent": "Ticket-Tagger",
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!response.ok) {
    return {};
  }
  const body = await response.json();
  const repositoryConfigYaml = Buffer.from(body.content, "base64").toString(
    "utf8"
  );
  let repositoryConfig;
  try {
    repositoryConfig = yaml.parse(repositoryConfigYaml);
  } catch (err) {
    return {};
  }
  if (repositoryConfigSchema.validate(repositoryConfig).error) {
    return {};
  }
  return repositoryConfig;
};

exports.createAccessToken = async ({ installationId }) => {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${makeJwt()}`,
        "User-Agent": "Ticket-Tagger",
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
    }
  );
  const { token } = await response.json();
  return token;
};

/**
 * Creates a new JWT for authorizing ticket-tagger.
 * Used for requesting installation specific access tokens.
 *
 * @returns {String} A ticket-tagger JWT
 */
function makeJwt() {
  const iat = (Date.now() / 1000) | 0;
  const exp = iat + 30;
  const iss = config.GITHUB_APP_ID;
  return jwt.sign({ iat, exp, iss }, config.GITHUB_CERT, {
    algorithm: "RS256",
  });
}
