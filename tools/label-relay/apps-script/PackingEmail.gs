// Separate, sender-only Apps Script project. No triggers, no inbox reads.
// Set PE_ENABLED=yes only after review + test. Keys live in Script Properties.
// PE_RECIPIENT, PE_SENDER_ALIAS, PE_SECRET (32+ chars), PE_LOG_SHEET_ID.
// Pre-create a private sheet tab "Packing Delivery Log" with:
// Request ID | Digest | State | IST time
function packingReply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
function packingEqual_(a,b) {
  if (a.length!==b.length) return false;
  var n=0; for(var i=0;i<a.length;i++) n|=a.charCodeAt(i)^b.charCodeAt(i);
  return n===0;
}
function doPost(e) {
  var props=PropertiesService.getScriptProperties(), envelope, body;
  try {
    if (props.getProperty('PE_ENABLED')!=='yes') throw new Error('Disabled');
    var raw=e.postData.contents;
    if(raw.length>6000000) throw new Error('Too large');
    envelope=JSON.parse(raw);
    var secret=props.getProperty('PE_SECRET');
    if(!secret || secret.length<32 || typeof envelope.body!=='string' || typeof envelope.signature!=='string' ||
       typeof envelope.timestamp!=='number' || Math.abs(Date.now()-envelope.timestamp)>300000) throw new Error('Invalid envelope');
    var signature=Utilities.base64Encode(Utilities.computeHmacSha256Signature(envelope.timestamp+'.'+envelope.body,secret,Utilities.Charset.UTF_8));
    if(!packingEqual_(signature,envelope.signature)) throw new Error('Invalid signature');
    body=JSON.parse(envelope.body);
    if(typeof body.id!=='string' || body.id.length>250 || !/^shipping:[a-zA-Z0-9:_ .-]+$/.test(body.id) ||
       typeof body.subject!=='string' || !body.subject.startsWith('Label Relay shipping labels - ') || /[^\x20-\x7e]/.test(body.subject) ||
       typeof body.text!=='string' || typeof body.html!=='string' || body.text.length>30000 || body.html.length>60000 ||
       !Array.isArray(body.attachments) || body.attachments.length!==1) throw new Error('Invalid message');
    var recipient=props.getProperty('PE_RECIPIENT'), alias=props.getProperty('PE_SENDER_ALIAS');
    if(!recipient || !/^[^\s@,;]+@[^\s@,;]+$/.test(recipient) || !alias || GmailApp.getAliases().indexOf(alias)<0) throw new Error('Sender/recipient not configured');
    var expected=['Label Relay-labels.pdf'];
    var attachments=body.attachments.map(function(a,index) {
      if(a.name!==expected[index] || typeof a.base64!=='string' || a.base64.length>2800000 || !/^[A-Za-z0-9+/=]+$/.test(a.base64)) throw new Error('Invalid PDF');
      var bytes=Utilities.base64Decode(a.base64);
      var head=String.fromCharCode.apply(null,bytes.slice(0,5).map(function(n){return n&255;}));
      if(head!=='%PDF-') throw new Error('Not a PDF');
      return Utilities.newBlob(bytes,'application/pdf',a.name);
    });
  } catch(error) { return packingReply_({status:'rejected_before_send'}); }
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return packingReply_({status:'rejected_before_send'});
  try {
    var sheet=SpreadsheetApp.openById(props.getProperty('PE_LOG_SHEET_ID')).getSheetByName('Packing Delivery Log');
    if(!sheet || sheet.getLastRow()<1) return packingReply_({status:'rejected_before_send'});
    // This sender's ledger is bounded to a small business. Archive explicitly before 5,000 rows.
    if(sheet.getLastRow()>5000) return packingReply_({status:'rejected_before_send'});
    var digest=Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,envelope.body,Utilities.Charset.UTF_8));
    var rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];
    for(var i=0;i<rows.length;i++) if(rows[i][0]===body.id) {
      return packingReply_({id:body.id,status:rows[i][1]===digest && rows[i][2]==='accepted'?'accepted':'needs_review'});
    }
    if(MailApp.getRemainingDailyQuota()<1) return packingReply_({status:'rejected_before_send'});
    // Persist before sending. A timeout or restart never sends the same batch a second time.
    sheet.appendRow([body.id,digest,'started',Utilities.formatDate(new Date(),'Asia/Kolkata','d MMM yyyy, h:mm a')]);
    SpreadsheetApp.flush();
    var row=sheet.getLastRow();
    try {
      GmailApp.sendEmail(recipient,body.subject,body.text,{from:alias,htmlBody:body.html,attachments:attachments,name:'Label Relay Packing'});
      sheet.getRange(row,3).setValue('accepted'); SpreadsheetApp.flush();
      return packingReply_({id:body.id,status:'accepted'});
    } catch(error) { return packingReply_({id:body.id,status:'needs_review'}); }
  } catch(error) { return packingReply_({id:body.id,status:'needs_review'}); }
  finally {lock.releaseLock();}
}
