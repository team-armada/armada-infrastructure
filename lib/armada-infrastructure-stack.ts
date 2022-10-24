import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
export class ArmadaInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a Virtual Private Network
    const vpc = new ec2.Vpc(this, 'TheVPC', {
      cidr: '10.0.0.0/16',
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      natGateways: 0,
    });

    // EC2 Instance Security Group
    const SecurityGroup = new ec2.SecurityGroup(this, 'armada-security-group', {
      vpc,
      description: 'Security Group for Armada Instance',
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
      securityGroupName: 'Armada Security Group',
    });

    // Allow SSH
    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'SSH Access'
    );

    // Allow HTTP
    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    // Allow HTTPS
    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS Access'
    );

    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow Container Access'
    );

    // TODO: get AMI ID from SSM param store to get portable deployments
    const latestUbuntuImageURL =
      '/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id';
    const instanceAMI = ec2.MachineImage.fromSsmParameter(
      latestUbuntuImageURL,
      {
        os: ec2.OperatingSystemType.LINUX,
      }
    );

    // Elastic Container Registry (ECR)
    const repository = new ecr.Repository(this, 'Repository');

    // Elastic Container Service
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // Add capacity to the cluster.
    const clusterInstance = cluster.addCapacity(
      'DefaultAutoScalingGroupCapacity',
      {
        instanceType: new ec2.InstanceType('t2.micro'),
        desiredCapacity: 1,
      }
    );

    clusterInstance.addSecurityGroup(SecurityGroup);
  }
}
