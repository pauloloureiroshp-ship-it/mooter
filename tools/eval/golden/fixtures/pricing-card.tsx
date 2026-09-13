'use client';

import { useState } from 'react';

export default function Card() {
  const cls = 'card';
  return (
    <div className={cls}>
      <h3 className="title">Pro</h3>
      <p>Ten dollars a month for everything.</p>
    </div>
  );
}
