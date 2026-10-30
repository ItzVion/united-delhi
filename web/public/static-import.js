'use strict';
const API='https://united-delhi-api.onrender.com';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function token(){return $('token').value.trim()}
function setStatus(kind,message,ok=null){$(kind+'Status').textContent=message;$(kind+'Status').className='status'+(ok===true?' ok':ok===false?' bad':'')}
async function request(url,options={}){
 const response=await fetch(API+url,{...options,headers:{...(options.headers||{}),'x-static-import-token':token(),'cache-control':'no-store'}});
 const body=await response.text();let data={};try{data=body?JSON.parse(body):{}}catch{throw new Error('Backend returned a non-JSON response (HTTP '+response.status+').')}
 if(!response.ok)throw new Error(data.reason||('HTTP '+response.status));return data;
}
async function runImport(kind){
 const file=$(kind==='dtc'?'busFile':'metroFile').files[0];if(!file){setStatus(kind,'Choose the '+(kind==='dtc'?'bus':'Metro')+' ZIP first.',false);return}
 if(!token()){setStatus(kind,'Paste the temporary upload token first.',false);return}
 const button=$(kind==='dtc'?'busButton':'metroButton');button.disabled=true;setStatus(kind,'Uploading '+file.name+' ('+(file.size/1048576).toFixed(2)+' MB)…');
 try{
  const accepted=await request('/api/admin/static-import/'+kind,{method:'POST',headers:{'content-type':'application/zip'},body:file});
  if(!accepted.jobId)throw new Error(accepted.reason||'The backend did not start an import job.');
  setStatus(kind,'Import running. Keep this page open.');
  let done=false;
  while(!done){
   await sleep(2000);
   const state=await request('/api/admin/static-import/status/'+encodeURIComponent(accepted.jobId));
   const log=$(kind+'Log');log.hidden=!state.output;if(state.output)log.textContent=state.output.slice(-12000);
   if(state.status==='SUCCEEDED'){setStatus(kind,'Import completed successfully.',true);done=true}
   else if(state.status==='FAILED'){setStatus(kind,'Import failed. The previous data was preserved.',false);throw new Error('The importer exited with an error. See output above, then retry.')}
  }
 }catch(error){setStatus(kind,error.message||'Import failed.',false);const log=$(kind+'Log');log.hidden=false;log.textContent=(log.textContent+'\n'+(error.message||String(error))).slice(-12000)}
 finally{button.disabled=false}
}
$('busButton').addEventListener('click',()=>void runImport('dtc'));
$('metroButton').addEventListener('click',()=>void runImport('metro'));
