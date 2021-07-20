const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const TABLE_NAME = process.env["TableName"];

exports.handler = (event, context, callback) => {
    
    if(!event.body){
        console.log('No form data Found');
        callback(null, makeResponse(
                200,
                {message: 'No form data Found'}
            )
        
        );
        return;
    }
    
    let data = JSON.parse(event.body);
    
    console.log(data);
    
    const COIN_PAIR = data.coin_pair;
    
    const PRICE = data.price;
    
    const SIDE = data.side;
    
    const MODE = data.mode;
    
    
    if(!COIN_PAIR || !PRICE || !SIDE || !MODE){
        console.log('wrong requestbody');
      
        callback(null, makeResponse(
                401,
                {message: 'wrong requestbody'}
            )
        );
      return;
    }
    
    try{
      Number(PRICE);
    }catch(err){
        console.log(err.message());
        
        callback(null, makeResponse(
                401,
                {message: err.message()}
            )
        );
        return;
    }
    
    if(SIDE != 'up' && SIDE != 'down'){
        console.log('wrong requestbody');
        callback(null, makeResponse(
                401,
                {message: 'wrong requestbody'}
            )
        );
        return;
    }
    
    if(MODE == 'insert'){
      
        const params = {
            TableName: TABLE_NAME,
            Item: {
                    'coin_pair' : {S: COIN_PAIR},
                    'price' : {N: PRICE},
                    'side' : {S: SIDE}
                }
        };
        
        
      
        // Call DynamoDB to add the item to the table
        putDataToDynamoDB(params);
        
        callback(null, makeResponse(
                200,
                {message: "price alert inserted successfully"}
            )
        );
        return;
    
    }else if(MODE == 'delete'){
        const params = {
            TableName: TABLE_NAME,
            Key: {
                    'coin_pair' : {S: COIN_PAIR},
                    'price' : {N: PRICE}
                 }
        };
        
        deleteDataFromDynamoDB(params);
            
        callback(null, makeResponse(
                200,
                {message: "price alert deleted successfully"}
            )
        );
            
        return;
      
    }else{
        console.log('wrong requestbody');
        callback(null, makeResponse(
                401,
                {message: 'wrong requestbody'}
            )
        
        );
        return;
    }
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

const putDataToDynamoDB = async (params) => {
    
    console.log(params);
    // Call DynamoDB to add the item to the table
    try{
        await ddb.putItem(params).promise();
    }catch(err){
        console.error(err);
    }
};

const deleteDataFromDynamoDB = async (params) => {
        
    try{
        ddb.deleteItem(params).promise();
    }catch(err){
        console.error(err);
    }
};