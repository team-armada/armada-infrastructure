import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import * as path from 'path';

import { ManagedPolicies } from '../../utils/policies';

// User data script 
const scriptPath = path.join(__dirname, "./user-data.sh"); 
const userDataScript = fs.readFileSync(scriptPath, 'utf8');

export interface AdminNodeStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
  readonly region: string | undefined; 
  readonly keyPairName: string | undefined; 
  readonly availabilityZone: string | undefined; 
}


export class AdminNodeStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props?: AdminNodeStackProps) {
    super(scope, id, props); 

    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc');
    }

    if (!props?.region) {
      throw new Error('Please provide the region');
    }

    if (!props?.keyPairName) {
      throw new Error('Please provide a key pair name');
    }

    if (!props?.availabilityZone) {
      throw new Error('Please provide an availability zone');
    }

    // AdminNode Security Group
    const adminNodeSecurityGroup = new ec2.SecurityGroup(this, 'ec2-rds-1', {
      description: 'The security group for the admin node',
      vpc: props.vpc,
    });

    adminNodeSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // Secrets manager
    const adminNodeRole = new iam.Role(this, 'Admin-Node-Access-Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com', {
        region: props.region,
      }),
      description: 'Allow EC2 to access AWS Secrets Manager and RDS',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.SecretsManagerReadWrite
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AmazonRDSFullAccess
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AmazonCognitoPowerUser
        ),
      ],
    });


    const adminNode = new ec2.Instance(this, 'Armada-AdminNode', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      role: adminNodeRole,
      availabilityZone: props.availabilityZone,
      securityGroup: adminNodeSecurityGroup,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: props.keyPairName,
    });

    adminNode.addUserData(userDataScript);
  }
}