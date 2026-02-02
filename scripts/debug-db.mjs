#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl ? 'SET' : 'MISSING');
console.log('Key:', supabaseServiceKey ? 'SET (length: ' + supabaseServiceKey.length + ')' : 'MISSING');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Check phenomena
const { data: phenomena, error: pError, count: pCount } = await supabase
  .from('phenomena')
  .select('id, name, ai_description', { count: 'exact' })
  .eq('status', 'active')
  .limit(5);

console.log('\nPhenomena query error:', pError);
console.log('Phenomena total:', pCount);
console.log('Sample:', phenomena?.map(p => ({ name: p.name, hasDesc: !!p.ai_description })));

// Check how many need content
const { data: needContent, count: ncCount } = await supabase
  .from('phenomena')
  .select('id', { count: 'exact' })
  .eq('status', 'active')
  .is('ai_description', null);

console.log('Need content:', ncCount);

// Check reports
const { count: rCount, error: rError } = await supabase
  .from('reports')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'approved');

console.log('\nReports query error:', rError);
console.log('Approved reports:', rCount);
