#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArmadaRootStack } from "../lib/root-stack/root.stack"; 

const app = new cdk.App();

new ArmadaRootStack(app, "Armada-Root-Stack", {
  stackName: "Armada-Root-Stack",
  keyPairName: process.env.ADMIN_NODE_KEY_PAIR_NAME, // e.g. 'my-us-east-2-key-pair'
  region: process.env.AWS_DEFAULT_REGION, // e.g. 'us-east-2'
  availabilityZone: process.env.AWS_AVAILABILITY_ZONE, // e.g. 'us-east-2a'
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKeyId: process.env.AWS_SECRET_ACCESS_KEY,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

