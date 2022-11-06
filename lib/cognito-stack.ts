import { Construct } from 'constructs'; 
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface CognitoStackProps extends cdk.NestedStackProps {}

export class CognitoStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props); 

    // ATTENTION: Cognito user pools are immutable
    // once a user pool has been created it cannot be changed.
    const cognitoUserPool = new cognito.UserPool(this, 'Cognito-User-Pool', {
      userPoolName: 'Cognito-User-Pool', 
      signInCaseSensitive: false, 
      // users are allowed to sign up
      selfSignUpEnabled: true, 
      // users are allowed to sign in with email only
      signInAliases: {
        email: true, 
      }, 
      // attributes cognito will request verification for 
      autoVerify: {
        email: true, 
      }, 
      // keep original email, until user verifies new email
      keepOriginal: {
        email: true
      },

      // Sign up 
      // standard attributes users must provide when signing up 
      standardAttributes: {
        // required
        email: {
          required: true, 
          mutable: true
        },
        preferredUsername: {
          required: false, 
          mutable: true
        },
        // to be updated when user sets up profile 
        givenName: {
          required: false, 
          mutable: true
        }, 
        familyName: {
          required: false, 
          mutable: true
        }, 
        timezone: {
          required: false, 
          mutable: true
        }, 
        profilePage: {
          required: false, 
          mutable: true
        },
        lastUpdateTime: {
          required: false, 
          mutable: true
        },
        website: {
          required: false, 
          mutable: true
        },
        profilePicture: {
          required: false, 
          mutable: true
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
        tempPasswordValidity: cdk.Duration.days(7)
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
        emailBody: 'Thanks for signing up to Armada! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: 'Invite to join Armada!',
        emailBody: 'Hello {username}, you have been invited to join Armada! Your temporary password is {####}',
      },

      email: cognito.UserPoolEmail.withCognito("support@releasethefleet.com")
    });
    
    // Cognito App Client 
    const client = cognitoUserPool.addClient('Cognito-App-Client'); 

    
  }
}