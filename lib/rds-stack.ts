import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';


interface RDSStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc;
  rdsSecurityGroup: ec2.SecurityGroup;  
}


export class RDSStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: RDSStackProps) {
    super(scope, id, props); 

    // first, lets generate a secret to be used as credentials for our database
    const databaseCredentialsSecret = new secretsManager.Secret(this, `database-DBCredentialsSecret`, {
      secretName: `database-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'postgres',
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    });

    // next, create a new string parameter to be used
    new ssm.StringParameter(this, 'DBCredentialsArn', {
      parameterName: `database-credentials-arn`,
      stringValue: databaseCredentialsSecret.secretArn,
    });

    // get the default security group
    let defaultSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this, 
      "SG", 
      props.vpc.vpcDefaultSecurityGroup);

    const engine = rds.DatabaseInstanceEngine.postgres({ 
      version: rds.PostgresEngineVersion.VER_13_7 
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Postgres-Database', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      engine,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      // credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      // credentials: rds.Credentials.fromSecret(databaseSecret),
      multiAz: false,
      allocatedStorage: 100,
      maxAllocatedStorage: 105,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: 'PostgresDatabase',
      publiclyAccessible: false,
    });

    dbInstance.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [props.rdsSecurityGroup],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic from EC2 instances on RDS connection security group'
    );

    new cdk.CfnOutput(this, 'dbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
    });

    new cdk.CfnOutput(this, 'secretName', {
      value: dbInstance.secret?.secretName!,
    });

    // lets output a few properties to help use find the credentials
    new cdk.CfnOutput(this, 'Secret Name', { 
      value: databaseCredentialsSecret.secretName 
    });
    
    new cdk.CfnOutput(this, 'Secret ARN', { 
      value: databaseCredentialsSecret.secretArn
    });

    new cdk.CfnOutput(this, 'Secret Full ARN', { 
      value: databaseCredentialsSecret.secretFullArn || '' 
    });
  }
}