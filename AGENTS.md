# Instructions for AI contributors

Read README.md, docs/AI-HANDOVER.md, ROADMAP.md, CHANGELOG.md, CONTRIBUTING.md and SECURITY.md before changes. Read the relevant tool's README and integration contract before editing code.

## Purpose and boundaries

Build free, MIT-licensed public tools for D2C brands. Label Relay is the first tool. Publish only reusable code and synthetic examples. Never copy private repository content, customer data, real shipping labels, credentials, account configuration or links to private systems into this repository, issues, commits or pull requests.

## Collaboration

The initial public toolkit had a one-time exception allowing preparation/upload without waiting for Claude review. This is not continuing authorization. From the next changes onward, work on a branch, open a focused PR, have Claude review it, and let Ronak merge. Do not push changes directly to main or merge for the owner. Do not treat an AI review as owner permission to deploy or perform live operations.

For every change, update CHANGELOG.md and docs/AI-HANDOVER.md if status changes. Explain behavior, validation and remaining limitations in the PR. Use meaningful offline tests for code changes; do not contact carriers, send messages or create shipments from tests. Never claim a live integration, adoption metric or completed feature without evidence.

## Current stage

Implementation is in PR #1 until merged. Components have 28 offline tests and CI; carrier adapter, runnable cloud deployment and live acceptance remain pending. The application was reported submitted by Ronak on 2 Nov 2026; no approval has been reported. See docs/claude-oss-application.md. Do not resubmit or claim the grant is approved.
