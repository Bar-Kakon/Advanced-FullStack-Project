import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { FieldLabel } from '../../../components/FieldLabel';
import { FormAlert } from '../../../components/FormAlert';
import { SelectField } from '../../../components/SelectField';
import { TextField } from '../../../components/TextField';
import { classifySubmitContactError, submitContactMessage } from '../../../api/contact.api';
import { CONTACT_TOPICS, type ContactTopic, type SubmitContactFailure } from '../../../api/contact.types';
import { useLanguage } from '../../../i18n/useLanguage';
import { EMAIL_PATTERN } from '../../../shared/validation';

/** Bounds copied from the endpoint's schema, so the box refuses what the server would reject. */
const MAX = { name: 100, email: 254, message: 2000 } as const;
const MIN_MESSAGE_LENGTH = 10;

/**
 * The contact form on the public Landing page — the only Contact entry point the product has, and
 * a form rather than a mail link by owner decision.
 *
 * It is submitted signed out, so it sends no identity of its own: the name and address typed here
 * are the whole of what the platform learns, and nothing on this page reads an account.
 */
export const ContactForm = () => {
  const { t, lang } = useLanguage();
  const contact = t.landing.contact;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<ContactTopic | ''>('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState<{ email?: boolean; message?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SubmitContactFailure | null>(null);
  const [sent, setSent] = useState(false);

  const topicOptions = CONTACT_TOPICS.map((code) => ({ value: code, label: contact.topic[code] }));

  // Complained about only once there is something to judge, so a pristine form is never scolded.
  const emailBad = email.length > 0 && !EMAIL_PATTERN.test(email.trim());
  const messageBad = message.length > 0 && message.trim().length < MIN_MESSAGE_LENGTH;

  const complete =
    name.trim().length >= 2
    && email.trim().length > 0 && !emailBad
    && topic !== ''
    && message.trim().length >= MIN_MESSAGE_LENGTH;

  const alertMessage =
    failure === 'REQUEST_VALIDATION_FAILED' ? contact.errors.validation
      : failure === 'TOO_MANY_REQUESTS' ? contact.errors.rateLimited
        : failure === 'NETWORK' ? contact.errors.network
          : contact.errors.unknown;

  const send = async (): Promise<void> => {
    // The topic is tested first: it is what narrows the value the payload carries, and testing
    // `complete` before it would have already done that narrowing implicitly.
    if (topic === '' || !complete || busy) return;

    setBusy(true);
    setFailure(null);
    try {
      await submitContactMessage({
        name: name.trim(),
        email: email.trim(),
        topic,
        message: message.trim(),
        // So a reply is written in the language the sender actually used.
        language: lang,
      });
      setSent(true);
    } catch (error) {
      setFailure(classifySubmitContactError(error));
    } finally {
      setBusy(false);
    }
  };

  const reset = (): void => {
    setName('');
    setEmail('');
    setTopic('');
    setMessage('');
    setTouched({});
    setFailure(null);
    setSent(false);
  };

  if (sent) {
    return (
      <div className="contact__card contact__card--done" role="status">
        <h3 className="contact__done-title">{contact.submittedTitle}</h3>
        <p className="contact__done-body">{contact.submitted}</p>
        <button type="button" className="btn btn--outline btn--sm" onClick={reset}>
          {contact.again}
        </button>
      </div>
    );
  }

  return (
    <form
      className="contact__card"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {failure ? <FormAlert message={alertMessage} /> : null}

      <div className="contact__grid">
        <TextField
          className="contact__col" id="contact-name" label={contact.name.label}
          placeholder={contact.name.placeholder} autoComplete="name" maxLength={MAX.name} required
          value={name} onChange={setName}
        />
        <TextField
          className="contact__col" id="contact-email" label={contact.email.label} type="email" dir="ltr"
          placeholder={contact.email.placeholder} autoComplete="email" maxLength={MAX.email} required
          value={email} onChange={setEmail}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          touched={!!touched.email}
          {...(emailBad ? { error: contact.email.error } : {})}
        />
        <SelectField<ContactTopic>
          className="contact__col contact__col--full" id="contact-topic" label={contact.topic.label}
          placeholder={contact.topic.placeholder} options={topicOptions} required
          value={topic} onChange={setTopic}
        />

        <div className="form-group contact__col contact__col--full">
          <FieldLabel htmlFor="contact-message" text={contact.message.label} />
          <textarea
            className={`form-input contact__message${touched.message ? ' touched' : ''}`}
            id="contact-message"
            name="contact-message"
            dir="auto"
            rows={5}
            maxLength={MAX.message}
            required
            placeholder={contact.message.placeholder}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, message: true }))}
          />
          <p className="field-hint">{contact.message.hint}</p>
          {messageBad && touched.message ? (
            <p className="field-error field-error--visible" aria-live="polite">{contact.message.error}</p>
          ) : null}
        </div>
      </div>

      <button type="submit" className="btn btn--primary contact__submit" disabled={!complete || busy} aria-busy={busy}>
        {contact.submit}
        {busy ? <ButtonSpinner /> : null}
      </button>
    </form>
  );
};
