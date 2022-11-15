#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArmadaInfraStack } from '../lib/armada-infrastructure-stack';

const app = new cdk.App();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stack = new ArmadaInfraStack(app, 'ArmadaInfraStack', {
  adminNodeKeyPairName: process.env.ADMIN_NODE_KEY_PAIR_NAME, // e.g. 'my-us-east-2-key-pair'
  region: process.env.AWS_DEFAULT_REGION, // e.g. 'us-east-2'
  availabilityZone: process.env.AWS_AVAILABILITY_ZONE, // e.g. 'us-east-2a'
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKeyId: process.env.AWS_SECRET_ACCESS_KEY,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
