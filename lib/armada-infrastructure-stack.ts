// import path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
// import * as iam from 'aws-cdk-lib/aws-iam';
// import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
// import * as ecrdeploy from 'cdk-ecr-deployment';


export class ArmadaInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /****************************************************************
    * Virtual Private Cloud (VPC)
    ****************************************************************/
    const vpc = new ec2.Vpc(this, 'VPC', {
      cidr: '10.0.0.0/16',
      maxAzs: 3,
      subnetConfiguration: [
        {
          name: 'publicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      natGateways: 0,
    });


    /****************************************************************
     * Security Groups
    ****************************************************************/
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Security Group for Armada Instance',
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
      securityGroupName: 'Security Group for Armada App',
    });

    // Allow SSH
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'SSH Access'
    );

    // Allow HTTP
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    // Allow HTTPS
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS Access'
    );

    // With dynamic port mapping we won't have to
    // hard code the host container port
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow Container Access'
    );

    // Add default capacity to the cluster.
    const ec2InstanceType = ec2.InstanceType.of(
      ec2.InstanceClass.T2,
      ec2.InstanceSize.MICRO,
    );

    /****************************************************************
     * Auto Scaling Group 
    ****************************************************************/
    // Explicitly add customized capacity through ASG
    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: ec2InstanceType,
      machineImage: ecs.EcsOptimizedImage.amazonLinux(),
      desiredCapacity: 1, 
      minCapacity: 1, 
      maxCapacity: 3,
      securityGroup: securityGroup
    })

    // ECS Capacity Provider
    // A capacity provider is an abstraction that uses an ASG underneath
    // It's a way to make your ECS cluster "ASG-aware". Think ASG adapter for ECS
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });
    
    
    
    /****************************************************************
     * Elastic Container Service
    ****************************************************************/
    const cluster = new ecs.Cluster(this, 'ECS-Cluster', { 
      clusterName: 'ECS-Cluster', 
      vpc: vpc,
      containerInsights: true // enabled for CloudWatch logs
    });
    
    // Attach Security grouop to ECS cluster
    cluster.addAsgCapacityProvider(capacityProvider)
  

    // register default task definitions HERE (e.g. JS, Ruby, Go)


    /****************************************************************
     * Application Load Balancer  
    ****************************************************************/
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: true
    }); 

    // // NOTE: eventually we want to use port 443 and HTTPS
    const lbListener = loadBalancer.addListener('LBListener', {
      port: 80, 
      open: true, // Allow CDK to automatically create security 
                 // group rule to allow traffic on port 80
      protocol: elbv2.ApplicationProtocol.HTTP,
    }); 
  
    // When you add an autoscaling group as the target 
    // CDK automatically puts the instances associated with that ASG into a target grouop
    lbListener.addTargets('LoadBalancerListener', {
      targets: [autoScalingGroup], 
      healthCheck: { 
        enabled: true,
        healthyHttpCodes: '200-299',
        path: '/'
      }
    });
    
    lbListener.connections.allowDefaultPortFromAnyIpv4('Open to the world');


    /****************************************************************
     * Task Definition + Service (FOR TESTING ONLY)
    ****************************************************************/
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Health-Check-Service-Task-Definition', {
      networkMode: ecs.NetworkMode.BRIDGE,
    }); 

    taskDefinition.addContainer('HealthCheckContainer', {
      image: ecs.ContainerImage.fromRegistry("amazon/health-check-service"), 
      memoryLimitMiB: 1024,
      portMappings: [
        { hostPort: 0, containerPort: 5000 }
      ]
    });
  
    // Instantiate an ECS Service 
    const ecsService = new ecs.Ec2Service(this, 'health-check-service', {
      cluster, 
      taskDefinition
    });    

    
  }


}

