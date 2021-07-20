const AWS = require('aws-sdk');
const axios = require('axios');
const querystring = require('querystring');
const momentTimezone = require('moment-timezone');
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const TABLE_NAME = process.env["TableName"];
const LINE_KEY = process.env["LINEApiKey"];

exports.handler = async (event, context, callback) => {
    
    let PRICE_FX_BTC_JPY = process.env['FX_BTC_JPY'];
    
    console.log(PRICE_FX_BTC_JPY);
    let price_alert_data;
    
    const params = {
        ExpressionAttributeValues: {
          ':c': {S: 'fx_btc_jpy'}
        },
        KeyConditionExpression: 'coin_pair = :c',
        ProjectionExpression: 'coin_pair, price, side',
        TableName: TABLE_NAME
    };
    
    let data = await queryDynamoDB(params);
    
    if(data.Items.length == 0){
      console.log("price check data not set");
      callback(null, {
          statusCode: 200,
          body: JSON.stringify({message: "price check data not set"}),
          headers: {"Content-type": "application/json"}
        });
      return;
    }
  
    price_alert_data = data.Items;
    
    const method = "GET";
    
    const path = "/v1/executions?product_code=FX_BTC_JPY";
     
    const option = {
        url: 'https://api.bitflyer.jp' + path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
          }
    };
    
    data = await axios(option);
        
    if(data.status != 200){
      console.error("Error:",data.response);
      callback(null, makeResponse(
          data.status,
          {message: data.response})
      );
      return;
    }
        
    const price_data = data.data;
    
    if(price_data.length == 0){
      console.log("price data not Found");
      callback(null, makeResponse(
          403,
          {message: 'No Data Found'}
        )  
      );
      return;
    }
        
    console.log(price_data);
        
    if(typeof PRICE_FX_BTC_JPY == 'undefined'){
      PRICE_FX_BTC_JPY = process.env['FX_BTC_JPY'] = price_data[0].price;
      console.log("Lambda Restarted");
      callback(null, makeResponse(
          200,
          {message: "Lambda Restarted"})
      );
      return;
    }
          
          
    for(const value of price_alert_data){
      console.log(value);
      if(value.side.S == 'up' && 
          Number(value.price.N) > PRICE_FX_BTC_JPY && Number(value.price.N) < Number(price_data[0].price)){
              console.log("["+value.coin_pair.S+"] " + value.price.N + "over");
             
              let message = '\n';
  
              const dateTimeJst = momentTimezone(new Date()).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss');
              
              message += "Price Alart for " + value.side.S + "\n" 
                      + "price " + value.price.N + "\n"
                      + dateTimeJst;
              process.env['FX_BTC_JPY'] = price_data[0].price;
              console.log(message);
              sendLine(message, callback);
              return;
      }else if(value.side.S == 'down' && 
                Number(value.price.N) < PRICE_FX_BTC_JPY && Number(value.price.N) > Number(price_data[0].price)){
                  console.log("["+value.coin_pair.S+"] " + value.price.N + "below");
                  
                  let message = '\n';
  
                  const dateTimeJst = momentTimezone(new Date()).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss');
                  
                  message += "Price Alart for " + value.side.S + "\n" 
                          + "price " + value.price.N + "\n"
                          + dateTimeJst;
                  process.env['FX_BTC_JPY'] = price_data[0].price;
                  console.log(message);
                  sendLine(message, callback);
                  return;
      }
    }
    process.env['FX_BTC_JPY'] = price_data[0].price;
    console.log("No Alert");
    callback(null, makeResponse(
          200,
          {message: "No Alert"}
        )
    );
    return;
};

const queryDynamoDB = async (params) =>{
      
      // Call DynamoDB to add the item to the table
      try{
        return await ddb.query(params).promise();
      }catch(err){
        return err;
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