const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const TABLE_NAME = process.env["TableName"];

exports.handler = async (event, context, callback) => {
    
    const params = {
      TableName: TABLE_NAME
    };
  
    let data = await scanDynamoDB(params);
   
        
    data = data.Items;
      
    console.log(data);
    
    if(!data){
        callback(null, makeResponse(
                400,
                {message: "No data Foundt"}
            )
        );
        return;
    }
    
    data.forEach(function(d){
        
        d.coin_pair = d.coin_pair.S;
        d.size = d.size.N;
        d.history = d.history.L;
        d.side = d.side.S;
        d.id = d.id.S;
        d.price = d.price.N;
    });
    callback(null, makeResponse(
            200,
            {data: data}
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

const scanDynamoDB = async (params) => {
  
    // Call DynamoDB to add the item to the table
    return ddb.scan(params).promise();
};