import {ListeningSessionPage} from '@/features/listening/listening-session';
export default async function Page({params}:{params:Promise<{sessionId:string}>}){const {sessionId}=await params;return <ListeningSessionPage key={sessionId} sessionId={sessionId}/>;}
