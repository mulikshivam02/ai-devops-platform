# Project Goals

## Product

ChangeLens

## Repository

ai-devops-platform

## Vision

Build an AI-powered DevOps platform that understands software and infrastructure changes, predicts their impact, observes the actual result, explains unexpected behavior, learns from historical changes, and safely assists with remediation.

## Core Product Loop

Change -> Understand -> Predict -> Deploy -> Observe -> Compare -> Explain -> Learn -> Safely Remediate

## Primary Goals

### Change Understanding

Understand changes across GitHub, Kubernetes, Terraform, configuration and deployments.

### Impact Prediction

Predict affected resources, dependency impact, blast radius, risk, possible performance effects and possible failure modes.

### Evidence-Based Investigation

Correlate changes, deployments, logs, metrics, events, infrastructure state and historical incidents.

### Prediction vs Reality

Compare predicted behavior against actual behavior after deployment. This is a core differentiating capability.

### Historical Intelligence

Learn from previous changes, failures, incidents, predictions and remediations.

### Safe Remediation

Assist with remediation while keeping humans in control of risky operations.

## Non-Goals

The platform is not intended to be:
- a generic ChatGPT clone
- a generic coding assistant
- a simple Kubernetes chatbot
- a generic monitoring dashboard
- an unrestricted AI shell executor
- an AI system that invents infrastructure state

## Success Criteria

The platform should eventually answer:
1. What changed?
2. What could this change affect?
3. How risky is it?
4. What do we expect to happen?
5. What actually happened?
6. Why did reality differ from the prediction?
7. Have we seen this before?
8. What should we do?
9. Can the fix be safely validated?
10. Did the fix actually work?
