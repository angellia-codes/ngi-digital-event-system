import { redirect } from 'next/navigation';

/** Old bookmark: the admin signs in with the admin PIN on the station screen. */
export default function AdminLogin() {
  redirect('/station');
}
