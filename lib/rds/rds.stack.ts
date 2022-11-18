import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';


export interface RDSStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
  readonly availabilityZone: string;
}

export class RDSStack extends cdk.NestedStack {
  public rds: rds.DatabaseInstance;
  public databaseCredentialsSecret: secretsManager.Secret;

  constructor(scope: Construct, id: string, props?: RDSStackProps) {
    super(scope, id, props); 

    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc')
    }


    // RDS Security Group
    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'rds-ec2-1', {
      vpc: props.vpc,
      description: 'The security group for the rds instance',
    });

    rdsSecurityGroup.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
    );
    

    // secret to be used as credentials for our database
    this.databaseCredentialsSecret = new secretsManager.Secret(this, "DB-Credential-Secret",
      {
        secretName: `database-credentials`,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: 'postgres',
          }),
          excludePunctuation: true,
          includeSpace: false,
          generateStringKey: 'password',
        },
      }
    );

    // next, create a new string parameter to be used
    new ssm.StringParameter(this, 'DBCredentialsArn', {
      parameterName: `database-credentials-arn`,
      stringValue: this.databaseCredentialsSecret.secretArn,
    });

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_13_7,
    });

    this.rds = new rds.DatabaseInstance(this, 'Postgres-Database', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      engine,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO
      ),
      availabilityZone: props.availabilityZone,
      securityGroups: [rdsSecurityGroup],
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
      credentials: rds.Credentials.fromSecret(this.databaseCredentialsSecret),
    });
  }

}