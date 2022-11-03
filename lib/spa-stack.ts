import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 

export interface SPAStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  rdsSecurityGroup: ec2.SecurityGroup; 
}

export class SPAStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: SPAStackProps) {
    super(scope, id, props);


  }
}
    