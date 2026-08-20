import PolicyDocumentScreen from '@/src/screens/policies/PolicyDocumentScreen';

/**
 * Signup and legacy `/terms-and-conditions` route — same shared Terms as Policies.
 * Role `variant` query param is ignored; one English policy set applies to everyone.
 */
export default function TermsAndConditionsScreen() {
  return <PolicyDocumentScreen doc="terms" />;
}
