const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const axios = require('axios');
const crypto = require('crypto');
const momentTimezone = require('moment-timezone');
const querystring = require('querystring');
const sqs = new AWS.SQS();
const ORDER_METHOD = 'OCO';
//const CONDITION_TYPE = 'STOP';
const STOP_PRICE_BIAS = 0.003;
const LIMIT_PRICE_BIAS = 0.001;
const SPECIAL_QUEUE_URL = process.env["SpecialOrderQueue"];
const queueUrl = SPECIAL_QUEUE_URL;
const groupId = "SPECIAL_ORDER";

const LAMBDA_NAME = process.env["LambdaName"];

const TABLE_NAME = process.env["TableName"];

const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const API_KEY = process.env["BitFlyerApiKey"];
const SECRET_KEY = process.env["BitFlyerSecretKey"];
const LINE_KEY = process.env["LINEApiKey"];

exports.handler = async (event, context, callback) => {
    
    const id = process.env['id'];
    console.log('id: ' + id);
    
    const timestamp = Date.now().toString();
    const method = 'GET';
    let path = '/v1/me/getchildorders?product_code=FX_BTC_JPY&child_order_state=COMPLETED';
    
    const afterID = '&after=';
    
    if(id){
        path += afterID + id;
    }
    
    const text = timestamp + method + path;
    const sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    const option = {
      url: 'https://api.bitflyer.jp' + path,
      method: method,
      headers: {
        'ACCESS-KEY': API_KEY,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-SIGN': sign,
        'Content-Type': 'application/json'
        }
    };
    let data;
    try { 
        const response = await axios(option);
        data = response.data;
    } catch (error) { 
        console.error(error.response.body); 
        callback(null, {
        statusCode: data.response.statusCode,
        body: JSON.stringify({message: data.response}),
        headers: {"Content-type": "application/json"}
        });
        return;
    }
        
    if(data.length == 0){
        console.log('No data Found');
        callback(null,{
            statusCode: 200,
            body: JSON.stringify({message: 'No data Found'}),
            headers: {"Content-type": "application/json"}
        });
        return;
    }
        
    //console.log(data)
        
    let firstId = data[0].id;
    
    let message="";
    
    for(let i=0; i<data.length; i++){
        
        var value=data[i];
        
        const dateTimeUtc = momentTimezone.tz(value.child_order_date.split(" ")[0], 'UTC');
        
        const dateTimeJst = momentTimezone(dateTimeUtc).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss');
        
        const date = new Date(dateTimeJst);
    
        const toDay = new Date(momentTimezone(new Date()).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss'));
        
        if(!id && toDay.getTime() - date.getTime() > 121000){
            data = data.slice(0,i);
            break;
        }
        
        message += "[" + value.side + ": " + value.child_order_type + "]\n"
                + "Date " + dateTimeJst + "\n"
                + "price " + value.price + "\n"
                + "size: " + value.size + "\n"
                + "average price: " + value.average_price + "\n"
                + "executed size: " + value.executed_size + "\n"
                + "----------------------\n";
                
    }
    
    if(id == null){
        console.log('Lambda Restarted');
    }
    
    process.env['id'] = firstId;
    
    if(message == ""){
        console.log('No data Found');
        callback(null,{
            statusCode: 200,
            body: JSON.stringify({message: 'No data Found'}),
            headers: {"Content-type": "application/json"}
        });
        return;
    }
    message = '\n' + message;
    console.log(message);
    
    let history = makeArrayforDynamoDB(data);
    
    sendLine(message);
        
    data = await scanDynamoDB();
    
    if(data.Items.length == 0){
      console.log("price check data not set");
      callback(null, {
          statusCode: 200,
          body: JSON.stringify({message: "price check data not set"}),
          headers: {"Content-type": "application/json"}
        });
        return;
    }
    
    const dbData = data.Items;
            
    data = await callLambda(LAMBDA_NAME);
            
    let body = JSON.parse(data.Payload).body;
    data = JSON.parse(body).data;
    
    console.log(data);
    
    const done_list = [];
    for(let item of dbData){
       
        if(data && data.find(d => d.parent_order_acceptance_id == item.id.S)) continue;
        
        let side;
        let stopbias = Number(item.price.N) * STOP_PRICE_BIAS;
        let limitbias = Number(item.price.N) * LIMIT_PRICE_BIAS;
        if(item.side.S == 'BUY'){
            side = 'SELL';
            stopbias = -stopbias;
            
        }else if(item.side.S == 'SELL'){
            side = 'BUY';
            limitbias = -limitbias;
        }
        var param1 = {
            product_code: item.coin_pair.S,
            condition_type: "STOP_LIMIT",
            side: side,
            size: item.size.N,
            price: (Number(item.price.N) + limitbias).toString(),
            trigger_price: item.price.N
        };
        var param2 = {
            product_code: item.coin_pair.S,
            condition_type: "STOP",
            side: side,
            size: item.size.N,
            trigger_price: (Number(item.price.N) + stopbias).toString()
        };
        
        const parameters = [param1,param2];
        
        console.log(parameters);
        var queueBody = {
            order_method: ORDER_METHOD,
            parameters: parameters,
            autoOrder: true
        };
        console.log(queueBody);
        sendSQS(queueBody, queueUrl, groupId);
       
        let dbHistory = item.history.L;
        dbHistory = dbHistory.concat(history);
        
        param1.history_data = dbHistory;
        
        console.log(param1.id);
        
        if(!param1.id){
            param1.id = '';
        }
      
        const params = {
                
            Item: {
                'coin_pair' : {S: param1.product_code},
                'price' : {N: param1.trigger_price},
                'side': {S: param1.side},
                'size': {N: param1.size},
                'id': {S: param1.id},
                'history': {L: param1.history_data}
            },
            TableName: TABLE_NAME
        };
        
        putDataToDynamoDB(params);
        done_list.push(item);
    }
    
    console.log(done_list);
    
    callback(null, {
        statusCode: 200,
        body: done_list,
        headers: {"Content-type": "application/json"}
    });
    return;
};


const sendLine = async (message) => {
    console.log(message);
    
    const option = {
        url: 'https://notify-api.line.me/api/notify',
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            'Authorization': 'Bearer ' + LINE_KEY
        },
        data: querystring.stringify(
            {
                message: message
            }
        )
    };

    try { 
        const response = await axios(option);
        console.log(response.data);
        
    } catch (error) { 
        console.error(error);
    }
};

const makeArrayforDynamoDB = (array) => {
    if(!array || array.length == 0){
        return;
    }
    var newArray = [];
    for(var item of array){
        
        var newItem = {};
        Object.keys(item).forEach(function (key) {
          if(typeof(item[key])=="number") newItem[key] = {N: item[key].toString()};
          else if(typeof(item[key]=='string')) newItem[key] = {S: item[key]};
        });
        newArray.push({M: newItem});
    }
    return newArray;   
};

const scanDynamoDB = async () => {
    var params = {
        TableName: 'stop_check_bitflyer'
    };
    
    // Call DynamoDB to add the item to the table
    return ddb.scan(params).promise();
};

const putDataToDynamoDB = async (params) => {
    
    console.log(params)
    try{
        await ddb.putItem(params).promise();
    }catch(err){
        console.error(err);
    }
};

const sendSQS = async (queueBody, queueUrl, groupId) => {
    
    var id=new Date().getTime().toString();
    
    // SQS message parameters
    var params = {
        
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

const callLambda = async (functionName) => {
    
    var params = {
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        //Payload: payload
    };
        
    return lambda.invoke(params).promise();
};