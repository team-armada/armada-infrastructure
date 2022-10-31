#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArmadaInfrastructureStack } from '../lib/armada-infrastructure-stack';

const app = new cdk.App();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stack = new ArmadaInfrastructureStack(app, 'ArmadaInfrastructureStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
