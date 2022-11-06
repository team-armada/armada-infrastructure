#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArmadaRootStack } from "../lib/armada-root-stack"; 

const app = new cdk.App();

new ArmadaRootStack(app, "Armada-Root-Stack", {
  stackName: "Armada-Root-Stack",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

app.synth(); 

