const AWS = require('aws-sdk');
const fs = require('fs');
const sqs = new AWS.SQS();
const lambda = new AWS.Lambda();
const NORMAL_QUEUE_URL = process.env["NormalOrderQueue"];
const SPECIAL_QUEUE_URL = process.env["SpecialOrderQueue"];
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({ region: 'ap-southeast-1' });
const BUCKET = process.env["BucketName"];
const TMP_FOLDER = '/tmp/';
const LAMBDA_NAME = process.env["LambdaName"];
const TABLE_NAME = process.env["TableName"];

exports.handler = async (event, context, callback) => {
    
    if(!event.body){
        console.log('No form data Found');
        callback(null, makeResponse(
            200,
            {message: 'No form data Found'})
    
        );
      return;
    }
    
    let body = JSON.parse(event.body);
    
    console.log(body);
    
    const COIN_PAIR = body.coin_pair;
    
    const PRICE = body.price;
    
    const SIDE = body.side;
    
    const SIZE = body.size;
    
    const TYPE = body.type;
    
    const PARAMETERS = body.parameters;

    const ORDER_METHOD = body.order_method;
    
    const MODE = body.mode;
    
    const PARENT_ID = body.parent_id;
    
    if(!TYPE && !PARAMETERS && !PRICE){
        console.log("invalid order:",body);
        callback(null, makeResponse(
                400,
                {message: "invalid order"}
            )
        );
        return;
    }
    
    if(COIN_PAIR != 'FX_BTC_JPY'){
        console.log("invalid coin pair");
        callback(null, makeResponse(
                400,
                {message: "invalid order"}
            )
        );
        return;
    }
    
    if(MODE != 'insert' && MODE != 'delete'){
        console.log("invalid mode:", MODE);
        callback(null, makeResponse(
                400,
                {message: "invalid order"}
            )
        );
        return;
    }
    
    if(MODE == 'insert'){
        let queueBody = {autoOrder: true};
        let queueUrl;
        let groupId;
        
        if(!PARAMETERS){
            
            if(!checkElement(body)){
                console.log("Bad body:", body);
                callback(null, makeResponse(
                    400,
                    {message: "invalid order"}
                )
            );
                return;
            }
            queueBody.product_code = COIN_PAIR;
            queueBody.child_order_type = TYPE;
            queueBody.side = SIDE;
            queueBody.price = PRICE;
            queueBody.size = SIZE;
            
            if(TYPE == 'STOP'){
                queueBody.trigger_price = queueBody.price;
                queueBody.price = 0;
            } 
            queueUrl = NORMAL_QUEUE_URL;
            
            groupId = "NORMAL_ORDER";
        }else{
            if(ORDER_METHOD != "SIMPLE" && ORDER_METHOD != "IFD"){
                console.log("bad order method:");
                callback(null, makeResponse(
                        400,
                        {message: "invalid order"}
                    )
                );
                return;
            }
    
            for(const parameter of PARAMETERS){
                if(!checkElement(parameter)){
                    console.log("Bad body:", parameter);
                    callback(null, makeResponse(
                            400,
                            {message: "invalid order"}
                        )
                    );
                    return;
                }
                parameter.product_code = COIN_PAIR;
                parameter.condition_type = parameter.type;
                if(parameter.condition_type == 'STOP'){
                    parameter.trigger_price = parameter.price;
                    parameter.price = 0;
                }
             }
             
             queueBody.order_method = ORDER_METHOD;
             queueBody.parameters = PARAMETERS;
             queueUrl = SPECIAL_QUEUE_URL;
             groupId = "SPECIAL_ORDER";
        }
      
        let data = await scanDynamoDB(TABLE_NAME);
        
            
        data = data.Items;
        
     
        if(data && data.find(d => d.coin_pair == COIN_PAIR || d.price == PRICE)){
            console.log('Data Already Exists:', data);
            callback(null, makeResponse(
                    401,
                    {message: 'Data Already Exists:'+ data}
                )
             );
             return;
        }
        
        let parameter;
        if(queueBody.parameters) parameter = queueBody.parameters[0];
        else{
          parameter = {
              product_code: COIN_PAIR,
              trigger_price: PRICE,
              side: SIDE,
              size: SIZE
          };
        }
        
        parameter.trigger_price = parameter.trigger_price.toString();
        parameter.size = parameter.size.toString();
        parameter.id ="newOrder";
        parameter.history_data = [];
        
        const params = {
            Item: {
                'coin_pair' : {S: parameter.product_code},
                'price' : {N: parameter.trigger_price},
                'side': {S: parameter.side},
                'size': {N: parameter.size},
                'id': {S: parameter.id},
                'history': {L: parameter.history_data}
            },
            TableName: TABLE_NAME
        };
        
        putDataToDynamoDB(params);
        sendSQS(queueBody, queueUrl, groupId);
        
        callback(null, makeResponse(
                200,
                {message: "order sent"}
            )
        );
        return;
        
    }else if(MODE == 'delete'){
        
        if(!PARENT_ID){
            console.log("invalid parent id:", PARENT_ID);
            callback(null, makeResponse(
                400,
                {message: "invalid order"}
                )
            );
            return;
        }
        
        let payload = {
            coin_pair: COIN_PAIR,
            parent_id: PARENT_ID
        };
        
        payload = JSON.stringify({body:JSON.stringify(payload)});
        
        let data = await callLambda(LAMBDA_NAME, payload);
        data = JSON.parse(data.Payload);
        
        if(data.statusCode != 200){
            console.log("Delete Error:", data);
            callback(null, makeResponse(
                    400,
                    {message: "Delete failed:", data}
                )
            );
            return;
        }
        
        data = await scanDynamoDB(TABLE_NAME);
            
        data = data.Items;
      
        let fileName;
        let filePath;
    
        for(let d of data){
            if(d.id.S == PARENT_ID){
                if(d.history.L.length > 0){
                    fileName = d.price.N.toString() + "_" + d.id.S + ".csv";
                    filePath = TMP_FOLDER + fileName;
                    let history = [];
                    let tmp_array = [];
                    for(let m in d.history.L[0].M) tmp_array.push(m);
                    history.push(tmp_array);
                
                    d.history.L.forEach(function(h){
                      tmp_array = [];
                      for(var m in h.M){
                          var value;
                          if(h.M[m].S) value = h.M[m].S;
                          else value = h.M[m].N;
                          tmp_array.push(value);
                      }
                      history.push(tmp_array);
                    });
                    console.log(history);
                    
                    await writeCSVfile(filePath, history);
                    // .then(function(){
                    let s3Params = {
                        Bucket: BUCKET,
                        Key: fileName,
                        Body: fs.readFileSync(filePath)
                    };
                    
                    await s3.putObject(s3Params).promise();
                    
                    const params = {
                        TableName: TABLE_NAME,
                        Key:{
                            'coin_pair' : {S: params.product_code},
                            'price' : {N: params.price}
                        }
                    };
                    
                    deleteDataFromDynamoDB(params);
                    
                    callback(null, makeResponse(
                            200,
                            {message: 'Order Delete Successfuly'}
                        )
                    );
                    return;
                }
            }
        }
        callback(null, makeResponse(
                200,
                {message: 'Order Delete failed'}
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
    
const scanDynamoDB = async (tableName) => {
    const params = {
        TableName: tableName
    };
    
    // Call DynamoDB to add the item to the table
    return ddb.scan(params).promise();
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
    
const sendSQS = async (queueBody, queueUrl, groupId) => {
    
    const id=new Date().getTime().toString();
    
    // SQS message parameters
    const params = {
        
        MessageBody: JSON.stringify(queueBody),
        MessageGroupId: groupId,
        MessageDeduplicationId: id,
        QueueUrl: queueUrl
    };
    
    console.log(params);
    try{
        sqs.sendMessage(params).promise();
    }catch(err){
        console.error(err);
    }
};
    
const callLambda = async (functionName, payload) => {
    
    const params = {
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        Payload: payload
    };
        
    return lambda.invoke(params).promise();
};
    
    
const checkElement = (element) => {
    if(element.type == 'MARKET' || element.type == 'LIMIT'
    || element.type == 'STOP'){
            
        if(element.side != 'BUY' && element.side != 'SELL'){
            console.log("invalid side");
            return false;
        }
        
        
        element.price = Number(element.price);
        element.size = Number(element.size);
        if(isNaN(element.price) && element.type != 'MARKET'){
            console.log("number invalid:", element.price);
            return false;
        }
        if(isNaN(element.size)){
            console.log("number invalid:", element.size);
            return false;
        }
        
        return true;
    }
    return false;
};
    
const writeCSVfile = async (filePath, array) => {
    await fs.writeFileSync(filePath, array.join('\n'));
};