import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';


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
    // Application Load Balancer Security Groups 
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', { 
      vpc,
      description: "ALB Security Group",
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(), 
      ec2.Port.tcp(80), 
      'HTTP Access'
    );

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(), 
      ec2.Port.tcp(80), 
      'HTTP Access'
    );


    // Launch Template Security Groups
    const ltSecurityGroup = new ec2.SecurityGroup(this, "Launch-Template-Security-Group", {
      vpc: vpc, 
      allowAllOutbound: true,
      description: "Security Group for Launch Template ECS Instances"
    })

    ltSecurityGroup.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [albSecurityGroup],
      }),
      ec2.Port.allTraffic(), 
      "Allow all traffic on all ports coming from Application Load Balancer"
    );


    /****************************************************************
     * Launch Template 
    ****************************************************************/
    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2, 
        ec2.InstanceSize.SMALL
      ),
      securityGroup: ltSecurityGroup, 
      userData: ec2.UserData.forLinux(),
      // grant ec2 instances communication access to ECS cluster
      role: new iam.Role(this, 'ec2AccessRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
      })
    });



    /****************************************************************
     * Auto Scaling Group 
    ****************************************************************/
    // Explicitly add customized capacity through ASG
    const asg = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc, 
      launchTemplate,
      minCapacity: 1, 
      desiredCapacity: 1,
      maxCapacity: 10
    })

    asg.scaleOnCpuUtilization('cpu-util-scaling', {
      targetUtilizationPercent: 50
    });
    
    
    /****************************************************************
     * Elastic Container Service
    ****************************************************************/
    // ECS Capacity Provider
    // A capacity provider is an abstraction that uses an ASG underneath
    // It's a way to make your ECS cluster "ASG-aware". Think ASG adapter for ECS
    // ECS capacity provider 
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'ASG-Capacity-Provider', {
      capacityProviderName: "ASG-Capacity-Provider", 
      // manage cluster scaling using ASG strategy
      autoScalingGroup: asg
    });

    const cluster = new ecs.Cluster(this, 'ECS-Cluster', { 
      clusterName: 'ECS-Cluster', 
      vpc: vpc,
      // collect metrics and logs from your containers
      containerInsights: true // enabled for CloudWatch logs
    });
    
    // Attach Security grouop to ECS cluster
    cluster.addAsgCapacityProvider(capacityProvider)
  


    /****************************************************************
     * Application Load Balancer  
    ****************************************************************/ 
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Load-Balancer', {
      vpc: vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // TODO: eventually we want to use port 443 and HTTPS
    const listener = alb.addListener('ALB-Listener', {
      port: 80,   // listens for requests on port 80
      open: true, // Allow CDK to automatically create security 
                  // group rule to allow traffic on port 80
      protocol: elbv2.ApplicationProtocol.HTTP
    }); 
  
    // When you add an autoscaling group as the target 
    // CDK automatically puts the instances associated with that ASG into a target grouop
    listener.addTargets('Target-Group-ASG', {
      port: 80,
      // send traffic to automatically created Target Group 
      // that contains any instance created by Auto Scaling Group
      targets: [asg], 
      healthCheck: { 
        enabled: true,
        healthyHttpCodes: '200-299', 
        path: '/'
      }
    })
    
    // Create CFN Output 
    new cdk.CfnOutput(this, 'ALB-DNS-name', {
      value: alb.loadBalancerDnsName,
    });


    /****************************************************************
     * Task Definition (FOR TESTING ONLY, remove later)
    ****************************************************************/
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Task-Definition');

    taskDefinition.addContainer("nginxdemos-hello", {
      image: ecs.ContainerImage.fromRegistry("nginxdemos/hello"),
      memoryLimitMiB: 512,
      portMappings: [
        {
          hostPort: 0,
          containerPort: 80,
          protocol: ecs.Protocol.TCP,
        }
      ]
    }); 
  }


}

