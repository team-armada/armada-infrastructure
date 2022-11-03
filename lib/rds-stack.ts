import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as efs from 'aws-cdk-lib/aws-efs';

export interface RDSStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  rdsSecurityGroup: ec2.SecurityGroup; 
}

export class RDSStack extends cdk.Stack {
  
  
  constructor(scope: cdk.App, id: string, props: RDSStackProps) {
    super(scope, id, props);


  }
}
    