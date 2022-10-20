import { readFileSync } from 'fs';
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

    // EC2 instance
    const keyName = 'kp-us-east-1';
    const ec2Instance = new ec2.Instance(this, 'Instance', {
      vpc,
      keyName,
      instanceType: new ec2.InstanceType('t2.micro'),
      machineImage: instanceAMI,
      securityGroup: SecurityGroup,

      // can we change deviceName to '/home/ubuntu' ?
      blockDevices: [
        {
          deviceName: '/dev/sdf',

          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3,
          }),
        },
      ],
    });

    // Load Script with User Data
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');

    // Add Script to the Instance
    ec2Instance.addUserData(userDataScript);

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

    // Add a new task
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'SetUpCodeServer');

    const clusterContainer = taskDefinition.addContainer('DefaultContainer', {
      image: ecs.ContainerImage.fromRegistry(
        'jdguillaume/base-code-server-no-auth'
      ),
      memoryLimitMiB: 512,
    });

    clusterContainer.addPortMappings({
      containerPort: 8080,
      hostPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

    // Attempting to automate the running of the task.

    // const runTask = new cdk.aws_stepfunctions_tasks.EcsRunTask(this, 'Run', {
    //   integrationPattern: cdk.aws_stepfunctions.IntegrationPattern.RUN_JOB,
    //   cluster,
    //   taskDefinition,
    //   launchTarget: new cdk.aws_stepfunctions_tasks.EcsEc2LaunchTarget({
    //     placementStrategies: [
    //       ecs.PlacementStrategy.spreadAcrossInstances(),
    //       ecs.PlacementStrategy.packedByCpu(),
    //       ecs.PlacementStrategy.randomly(),
    //     ],
    //   }),
    // });
  }
}
