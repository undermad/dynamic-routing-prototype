// The website's side of a page: turns what the journey asks (shared with the CLI) into what
// a Nunjucks template draws, and a submitted form back into an answer. The wording and the
// options come from the shared journey; only how they are laid out on a page is here.
// Nothing here knows about Express.
import {
  Answer,
  Asked,
  AskedChoice,
  AskedComplete,
  AskedDocuments,
  AskedFailed,
  askedOn,
  AskedStop,
  AskedStub,
  identityShown,
  IdentityShown,
  LEVEL_QUESTION,
  LEVELS,
  Page,
  StubResult,
  Submitted
} from '../shared/journey/journey';
import { DocumentType, IdentityResult } from '../shared/types';

interface Item {
  value: string;
  text: string;
  hint?: string;
}

// One option from a list, as radio buttons.
export interface RadiosView extends Omit<AskedChoice, 'kind' | 'options' | 'lastResort'> {
  template: 'radios';
  items: Item[];
  // Set apart at the end of the list, after an "or".
  lastResort?: Item;
}

// Any number of documents, or none of them, as checkboxes.
export interface CheckboxesView extends Omit<AskedDocuments, 'kind'> {
  template: 'checkboxes';
}

// One of several questions on a form: yes or no, or a choice of documents.
interface FormField {
  name: string;
  title: string;
  hint?: string;
  reminder?: string;
  // Set when the field is a choice of documents; otherwise it is yes or no.
  documents?: DocumentType[];
  noneLabel?: string;
}

// Several questions answered together, as one form.
export interface FieldsView {
  template: 'fields';
  title: string;
  intro: string;
  fields: FormField[];
}

// The page that stands in for a credential issuer.
export interface StubView extends Omit<AskedStub, 'kind' | 'results'> {
  template: 'cri-stub';
  items: (StubResult & { value: string })[];
}

export interface FailedView extends Omit<AskedFailed, 'kind'> {
  template: 'failed';
}

export interface CompleteView extends Omit<AskedComplete, 'kind'> {
  template: 'complete';
}

export interface StopView extends Omit<AskedStop, 'kind'> {
  template: 'stop';
}

// What the identity is made of, as read from the identity stub.
export interface IdentityStubView extends IdentityShown {
  template: 'identity-stub';
}

export type View =
  | RadiosView
  | CheckboxesView
  | FieldsView
  | StubView
  | FailedView
  | CompleteView
  | StopView;

// The value a form sends for "none of the above".
export const NONE = 'none';

// Options are sent back as their place in the list; "yes" and "no" as themselves.
const radios = ({ kind, options, lastResort, ...rest }: AskedChoice): RadiosView => {
  const value = (index: number): string =>
    rest.yesNo ? (index === 0 ? 'yes' : 'no') : String(index);

  return {
    template: 'radios',
    ...rest,
    items: options.map(({ label, hint }, index) => ({ value: value(index), text: label, hint })),
    lastResort: lastResort && { value: String(options.length), text: lastResort.label }
  };
};

const checkboxes = ({ kind, ...rest }: AskedDocuments): CheckboxesView => ({
  template: 'checkboxes',
  ...rest
});

const toView = (asked: Asked): View => {
  switch (asked.kind) {
    case 'choice':
      return radios(asked);

    case 'documents':
      return checkboxes(asked);

    case 'together':
      return {
        template: 'fields',
        title: asked.title,
        intro: asked.intro,
        fields: asked.questions.map((question, index) => ({
          name: `field-${index}`,
          title: question.title,
          hint: question.hint,
          reminder: question.reminder,
          ...(question.kind === 'documents'
            ? { documents: question.documents, noneLabel: question.noneLabel }
            : {})
        }))
      };

    case 'stub': {
      const { kind, results, ...rest } = asked;

      return {
        template: 'cri-stub',
        ...rest,
        items: results.map((result, index) => ({ ...result, value: String(index) }))
      };
    }

    case 'failed': {
      const { kind, ...rest } = asked;
      return { template: 'failed', ...rest };
    }

    case 'complete': {
      const { kind, ...rest } = asked;
      return { template: 'complete', ...rest };
    }

    case 'stop': {
      const { kind, ...rest } = asked;
      return { template: 'stop', ...rest };
    }
  }
};

export const viewOf = (page: Page): View => toView(askedOn(page));

// The first page, before there is a journey. A level is sent back by name.
export const START: RadiosView = {
  ...radios(LEVEL_QUESTION),
  items: LEVELS.map(level => ({ value: level, text: level }))
};

export const identityStubView = (identity: IdentityResult): IdentityStubView => ({
  template: 'identity-stub',
  ...identityShown(identity)
});

// `fieldErrors` lines up with the fields of a form that has several, for showing each
// error beside its field.
export type Parsed =
  | { submitted: Submitted }
  | { error: string; fieldErrors?: (string | undefined)[] };

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === '' ? [] : [String(value)];
};

// The documents ticked in a list that ends in "none of the above".
const readDocuments = (
  value: unknown,
  listed: DocumentType[],
  noneLabel: string
): { documents: DocumentType[] } | { error: string } => {
  const ticked = asList(value);
  const documents = listed.filter(document => ticked.includes(document));

  if (ticked.length === 0) {
    return { error: `Select the documents you have, or select ‘${noneLabel}’` };
  }
  if (ticked.includes(NONE) && documents.length > 0) {
    return { error: `Select the documents you have or ‘${noneLabel}’, not both` };
  }

  return { documents };
};

const readYesNo = (value: unknown): { yes: boolean } | { error: string } => {
  const [answer] = asList(value);

  return answer === 'yes' || answer === 'no' ? { yes: answer === 'yes' } : { error: 'Select yes or no' };
};

// Reads the form for a view. Anything that does not fit the page comes back as the error
// to show above it.
export const readForm = (view: View, body: Record<string, unknown> = {}): Parsed => {
  // Only a button to press.
  if (view.template === 'failed' || view.template === 'complete') {
    return { submitted: { index: 0 } };
  }

  if (view.template === 'checkboxes') {
    const read = readDocuments(body.documents, view.documents, view.noneLabel);

    return 'error' in read ? read : { submitted: { documents: read.documents } };
  }

  if (view.template === 'fields') {
    const read = view.fields.map(field =>
      field.documents
        ? readDocuments(body[field.name], field.documents, field.noneLabel ?? '')
        : readYesNo(body[field.name])
    );
    const fieldErrors = read.map(field => ('error' in field ? field.error : undefined));

    if (fieldErrors.some(error => error !== undefined)) {
      return { error: 'Answer every question on this page', fieldErrors };
    }

    const answers: Answer[] = read.map(field =>
      'documents' in field ? field.documents : 'yes' in field && field.yes
    );

    return { submitted: { answers } };
  }

  if (view.template !== 'radios' && view.template !== 'cri-stub') {
    return { error: 'There is nothing to answer on this page' };
  }

  const answer = asList(body.answer)[0];
  const allowed: { value: string }[] = [
    ...view.items,
    ...(view.template === 'radios' && view.lastResort ? [view.lastResort] : [])
  ];

  if (answer === undefined || !allowed.some(item => item.value === answer)) {
    return { error: 'Select an option' };
  }

  return { submitted: answer === 'yes' || answer === 'no' ? { yes: answer === 'yes' } : { index: Number(answer) } };
};
