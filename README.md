# bitflyerAPI

## About 

This project is Crypto currncy order web site, which uses bitflyer API.
This project is designed for the situation, which you cannot order on the bitflyer web.
By ordering through API, you can order directly to bitflyer order control server.
Even such a bitcoin falling down situation, I hope you can survive.

Actually, this project is yet proto type. This only manages FX_BTC_JPY.
In addition to that, if needed, other currency will be added.

## How to deploy

You need to set up these service and push repository to deploy the project.

- CodePipeline
  - CodeBuild
  - CodeDeploy
- IAM Role for CodePipeline

Or if needed I will create stack, which you only need IAM Role attached to and creates all services in template.yml

## Architecture

### Server

Serverless architecture, which uses API Gateway connected to Lambda with Lambda proxy.
As of Authentication, Cognito Authenticator is attached to each path of API Gateway.

### DB

DynamoDB is used in consideration of cost.

### Order system

SQS is used for asynchronous order, which I just use for AWS training.
But in result, it doesn't need to be SQS architecture. You can just fix it to make Lambda function order directory, not send SQS. 

