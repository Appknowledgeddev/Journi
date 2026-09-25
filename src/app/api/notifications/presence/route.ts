import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const header=request.headers.get("authorization")||""; const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!token)return NextResponse.json({error:"Missing user session."},{status:401});
  const {data:{user},error}=await supabaseAdmin.auth.getUser(token);
  if(error||!user)return NextResponse.json({error:"Invalid user session."},{status:401});
  const body=await request.json().catch(()=>({})) as {path?:string};
  const now=new Date().toISOString();
  const {error:saveError}=await supabaseAdmin.from("user_presence").upsert({user_id:user.id,last_seen_at:now,current_path:(body.path||"").slice(0,500),updated_at:now});
  if(saveError)return NextResponse.json({error:saveError.message},{status:500});
  return NextResponse.json({active:true,lastSeenAt:now});
}
