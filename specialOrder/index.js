const AWS = require('aws-sdk');
const axios = require('axios');
const crypto = require('crypto');
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const TABLE_NAME = process.env["TableName"];
const API_KEY = process.env["BitFlyerApiKey"];
const SECRET_KEY = process.env["BitFlyerSecretKey"];

exports.handler = async (event, context, callback) => {
    
    const body = JSON.parse(event.Records[0].body);

    if(!body){
        console.log("Queue Empty");
        callback(null, makeResponse(
                400,
                {message: "Queue Empty"}
            )
        );
        return;
    }
    
    
    console.log(body);
    
    if(!body.order_method || !body.parameters){
        console.log("element invalid");
        callback(null, makeResponse(
                400,
                {message: "element invalid"}
            )
        );
        return;
    }
    
    const timestamp = Date.now().toString();
    const method = 'POST';
    const path = '/v1/me/sendparentorder';
    
    const text = timestamp + method + path + JSON.stringify(body);
    const sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    const option = {
      url: 'https://api.bitflyer.com' + path,
      method: method,
      headers: {
        'ACCESS-KEY': API_KEY,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-SIGN': sign,
        'Content-Type': 'application/json'
        },
      data: JSON.stringify(body)
    };
    
    let data;
    try{
        data = await axios(option);
        console.log(data);
    }catch(err){
        console.log(err);
        callback(null, makeResponse(
                err.status,
                {message: err.response.data}
            )
        );
        return;
    }
    let message;
    if(data.status == 200){
        message = data.body;
        
        if(body.autoOrder){
            
            let params = body.parameters[0];
            params.id = JSON.parse(message).parent_order_acceptance_id;
            
            params = {
                    Key:{
                        "coin_pair": {S: params.product_code},
                        "price": {N: params.trigger_price}
                    },
                    UpdateExpression: "set id = :i",
                    ExpressionAttributeValues:{
                        ":i": {S: params.id}
                    },
                    ReturnValues:"UPDATED_NEW",
                    TableName: TABLE_NAME
            };
            
            updateDataToDynamoDB(params);
        }
    }else{
        message = data.response;
    }
    console.log(message);
    callback(null, makeResponse(
            data.status,
            {message: message}
        )
    );
    return;
};

const makeResponse = (statusCode, body) => {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS"
        }
    };
};

const updateDataToDynamoDB = (params) => {
        
        
    console.log(params);
      // Call DynamoDB to add the item to the table
    try{
        ddb.updateItem(params).primise();
    }catch(err){
        console.error(err);
    }
};