/** A single next-song preparation request through Pages to Render.
 * No client-provided URL, no cookie/credential propagation and no bulk API.
 * The Render worker retains the extraction task after this request ends.
 */
const ID=/^[A-Za-z0-9_-]{11}$/;
const HOST='https://nightcorelab.onrender.com';
export async function onRequestPost({params,request},fetcher=fetch){
 const id=params?.id;
 if(!ID.test(id||''))return new Response('Invalid track ID',{status:400});
 const contentLength=Number(request.headers.get('content-length')||0);
 if(contentLength>512)return new Response('Body too large',{status:413});
 // Deliberately ignore untrusted body: only the validated URL path ID is sent upstream.
 const origin=new URL('/prepare',HOST);
 try{
  const response=await fetcher(origin.href,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({url:'https://www.youtube.com/watch?v='+id}),
   redirect:'manual'
  });
  if(response.status===200||response.status===202){
   // Backend status is deliberately small and contains no credentials.
   return new Response(response.body,{status:response.status,headers:{
    'Content-Type':'application/json','Cache-Control':'no-store'
   }});
  }
  return new Response('Preparation unavailable',{status:response.status===429?429:503,
   headers:{'Cache-Control':'no-store','Retry-After':response.headers.get('Retry-After')||'20'}});
 }catch{
  return new Response('Origin unavailable',{status:503,headers:{'Retry-After':'20'}});
 }
}
