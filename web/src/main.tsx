import React from 'react';
import {createRoot} from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';

import App from './App';

class ErrorBoundary extends React.Component<React.PropsWithChildren, {error: Error|null}> {
  state={error:null as Error|null};
  static getDerivedStateFromError(error:Error){return {error};}
  render(){
    if(this.state.error){
      return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,fontFamily:'system-ui,sans-serif',background:'#f4f6f7',color:'#17313B'}}>
        <div style={{maxWidth:560,width:'100%',padding:24,borderRadius:18,background:'#fff',boxShadow:'0 8px 30px rgba(0,0,0,.08)'}}>
          <h1 style={{marginTop:0}}>United Delhi hit a frontend error</h1>
          <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{this.state.error.message}</p>
          <button onClick={()=>location.reload()} style={{padding:'10px 16px',border:0,borderRadius:10,background:'#00695C',color:'#fff'}}>Reload</button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);