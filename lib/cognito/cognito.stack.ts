import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';

import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

import * as path from 'path';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { readFileSync } from 'fs';
import { PolicyDocument } from 'aws-cdk-lib/aws-iam';

export interface CognitoStackProps extends cdk.NestedStackProps {}


export class CognitoStack extends cdk.NestedStack {
  public cognitoUserPool: cognito.UserPool; 
  public cognitoClient: cognito.UserPoolClient; 


  constructor(scope: Construct, id: string, props?: CognitoStackProps) {
    super(scope, id, props); 

    // ATTENTION: Cognito user pools are immutable
    // once a user pool has been created it cannot be changed.
    this.cognitoUserPool = new cognito.UserPool(this, 'Cognito-User-Pool', {
      userPoolName: 'Cognito-User-Pool',
      signInCaseSensitive: false,
      // users are allowed to sign up
      selfSignUpEnabled: false,
      // users are allowed to sign in with email only
      signInAliases: {
        email: false,
        username: true,
      },
      // attributes cognito will request verification for
      autoVerify: {
        email: true,
      },

      // keep original email, until user verifies new email
      keepOriginal: {
        email: true,
      },

      // Sign up
      // standard attributes users must provide when signing up
      standardAttributes: {
        // required
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
        profilePicture: {
          required: false,
          mutable: true,
        },
      },
      // non-standard attributes that will store user profile info
      // custom attributes cannot be marked as required
      customAttributes: {
        isAdmin: new cognito.StringAttribute({ mutable: true }),
      },
      // password policy criteria
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      // how users can recover their account if they forget their password
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // whether the user pool should be retained in the account after the
      // stack is deleted. set `cdk.RemovalPolicy.` to `RETAIN` when launching to production
      removalPolicy: cdk.RemovalPolicy.DESTROY,

      /* User verification
        - When a user signs up, email and SMS messages are used to verify their
          account and contact methods.
        - The following code snippet configures a user pool with properties to 
          these verification messages:
      */
      userVerification: {
        emailSubject: 'Please verify your email to get started using Armada!',
        emailBody:
          'Thanks for signing up to Armada! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: 'Invite to join Armada!',
        emailBody:
          'Hello {username}, you have been invited to join Armada! Your temporary password is {####}',
      },

      email: cognito.UserPoolEmail.withCognito('support@releasethefleet.com'),
    });

    // Cognito App Client
    this.cognitoClient = this.cognitoUserPool.addClient('Cognito-App-Client');

    // Add a default admin user.
    new cognito.CfnUserPoolUser(this, 'MyCfnUserPoolUser', {
      userPoolId: this.cognitoUserPool.userPoolId,

      // the properties below are optional
      userAttributes: [
        { name: 'custom:isAdmin', value: `true` },
        { name: 'given_name', value: `Armada` },
        { name: 'family_name', value: `Admin` },
        { name: 'email', value: `thefourofours@gmail.com` },
      ],
      username: 'ArmadaAdmin',
    });

    // Outputs
    new cdk.CfnOutput(this, 'userPoolId', {
      value: this.cognitoUserPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'userPoolClientId', {
      value: this.cognitoClient.userPoolClientId,
    });

  }
}