import { redirect } from 'next/navigation';

/**
 * The app's front door is the marketplace.
 *
 * This used to be a sign-up landing page, which put a wall between a visitor
 * and the thing they came for. A marketplace is browsable first and an account
 * is only needed to buy or sell, so `/` goes straight to the catalog.
 *
 * The old landing page still exists at /welcome for campaigns.
 */
export default function Root() {
  redirect('/shop');
}
