#!/bin/bash

yum update -y

# install nodejs
#  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
#  source ~/.bash_profile
#  nvm install 16
#  nvm use 16

# install/config docker and docker-compose
yum install docker -y
usermod -aG docker ec2-user
id ec2-user
newgrp docker
pip3 install docker-compose

# Install postgresql
#  amazon-linux-extras enable postgresql13
#  yum install postgres -y

# Miscellenea
yum install git -y
yum install postgresql -y
systemctl start postgresql
systemctl enable postgresql
yum install jq -y

# father forgive me for I am about to sin
RDS_ENDPOINT=$(aws rds describe-db-instances --region us-east-1 --db-instance-identifier $(aws rds describe-db-instances --region us-east-1 | jq ".DBInstances[].DBInstanceIdentifier" | grep armada | tr -d '"') | jq ".DBInstances[].Endpoint.Address" | tr -d '"')
RDS_USER=$(aws secretsmanager get-secret-value --region us-east-1 --secret-id database-credentials | jq -c '.SecretString | fromjson' | jq '.username' | tr -d '"')
RDS_PASSWORD=$(aws secretsmanager get-secret-value --region us-east-1 --secret-id database-credentials | jq -c '.SecretString | fromjson' | jq '.password' | tr -d '"')


ARMADA_DB_SCHEMA_REPO=https://github.com/team-armada/rds-post-installation.git
cd /home/ec2-user
git clone $ARMADA_DB_SCHEMA_REPO
cd /home/ec2-user/rds-post-installation


# set up psql connection and execute SQL script
psql postgresql://$RDS_USER:$RDS_PASSWORD@$RDS_ENDPOINT:5432 < create_database.sql
psql postgresql://$RDS_USER:$RDS_PASSWORD@$RDS_ENDPOINT:5432/Armada < schema.sql