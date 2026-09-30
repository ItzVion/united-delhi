import type { CSSProperties } from 'react';

const pageStyle:CSSProperties={minHeight:'100vh',padding:'24px',fontFamily:'Inter,system-ui,sans-serif'};

export default function App(){
  return <main style={pageStyle}>
    <h1>United Delhi</h1>
    <p>Delhi transit, made simple.</p>
  </main>;
}
