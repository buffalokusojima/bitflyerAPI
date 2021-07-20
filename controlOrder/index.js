var AWS = require('aws-sdk');
var sqs = new AWS.SQS();
const NORMAL_QUEUE_URL = process.env["NormalOrderQueue"];
const SPECIAL_QUEUE_URL = process.env["SpecialOrderQueue"];

exports.handler = function(event, context, callback) {
    
    const body = JSON.parse(event.body);
    
    if(!body){
        console.log("body empty");
        callback(null, makeResponse(
                400,
                {message: "body empty"}
            )
        );
        return;
    }
    
    const COIN_PAIR = body.coin_pair;
    
    const PRICE = body.price;
    
    const SIDE = body.side;
    
    const SIZE = body.size;
    
    const TYPE = body.type;
    
    const PARAMETERS = body.parameters;

    const ORDER_METHOD = body.order_method;
    
    if(!TYPE && !PARAMETERS){
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
    
    let queueBody;
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
        queueBody = {
            product_code: COIN_PAIR,
            child_order_type: TYPE,
            side: SIDE,
            price: PRICE,
            size: SIZE,
        };
        if(TYPE == 'STOP'){
            queueBody.trigger_price = queueBody.price;
            queueBody.price = 0;
        } 
        queueUrl = NORMAL_QUEUE_URL;
        
        groupId = "NORMAL_ORDER";
    }else{
        if(ORDER_METHOD != "SIMPLE" && ORDER_METHOD != "IFD" && ORDER_METHOD != "IFDOCO" && ORDER_METHOD != "OCO"){
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
        queueBody = {
            order_method: ORDER_METHOD,
            parameters: PARAMETERS
        };
        queueUrl = SPECIAL_QUEUE_URL;
        groupId = "SPECIAL_ORDER";
    }

    sendSQS(queueBody, queueUrl, groupId);        
    
    callback(null, makeResponse(
            200,
            {message: "Order Sent"}
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

const checkElement = async (element) => {
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