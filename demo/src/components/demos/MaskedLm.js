import React from 'react'
import { withRouter } from 'react-router-dom';
import styled from 'styled-components';
import _ from 'lodash';
import { Footer, ExternalLink } from '@allenai/varnish/components';

import OutputField from '../OutputField'
import { Accordion } from 'react-accessible-accordion';
import SaliencyComponent from '../Saliency'
import InputReductionComponent from '../InputReduction'
import HotflipComponent from '../Hotflip'
import { FormField, FormLabel, FormTextArea } from '../Form';
import { API_ROOT } from '../../api-config';
import {
  GRAD_INTERPRETER,
  IG_INTERPRETER,
  SG_INTERPRETER,
  INPUT_REDUCTION_ATTACKER,
  HOTFLIP_ATTACKER
} from '../InterpretConstants'
const apiUrl = () => `${API_ROOT}/predict/masked-lm`
const apiUrlInterpret = ({interpreter}) => `${API_ROOT}/interpret/masked-lm/${interpreter}`
const apiUrlAttack = ({attacker, name_of_input_to_attack, name_of_grad_input}) => `${API_ROOT}/attack/masked-lm/${attacker}/${name_of_input_to_attack}/${name_of_grad_input}`

const Wrapper = styled.div`
  color: #232323;
  font-size: 1em;
  background: #fff;
  overflow: scroll;
`

const ModelArea = styled.div`
  background: ${({theme}) => theme.palette.common.white};
`

const Loading = styled.div`
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  font-size: 0.8em;
  color: #8c9296;
`

const Error = styled(Loading)`
  color: red;
`

const LoadingText = styled.div`
  padding-left: ${({theme}) => theme.spacing.xs};
`

const InputOutput = styled.div`
  display: flex;
  margin-top: ${({theme}) => theme.spacing.sm};

  @media(max-width: 500px) {
    display: block;
  }
`

const InputOutputColumn = styled(FormField)`
  flex: 1 1 50%;

  :first-child {
    padding-right: ${({theme}) => theme.spacing.md};
  }

  :last-child {
    padding-left: ${({theme}) => theme.spacing.md};
  }

  @media(max-width: 500px) {
    :first-child,
    :last-child {
      padding: 0;
    }

    :first-child {
      padding: ${({theme}) => `0 0 ${theme.spacing.md}`};
    }
  }
`

const TextInput = styled(FormTextArea)`
  display: block;
  width: 100%;
  font-size: 1.25em;
  min-height: 100px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  padding: ${({theme}) => theme.spacing.md};
`

const ListItem = styled.li`
  margin: ${({theme}) => `0 0 ${theme.spacing.xs}`};
`

const ChoiceList = styled.ul`
  padding: 0;
  margin: 0;
  flex-wrap: wrap;
  list-style-type: none;
`

const ChoiceItem = styled.button`
  color: #2085bc;
  cursor: pointer;
  background: transparent;
  display: inline-flex;
  align-items: center;
  line-height: 1;
  font-size: 1.15em;
  border: none;
  border-bottom: ${({theme}) => `2px solid ${theme.palette.common.transparent}`};
`

const UndoButton = styled(ChoiceItem)`
  color: #8c9296;
  margin-bottom: ${({theme}) => theme.spacing.xl};
`

const Probability = styled.span`
  color: #8c9296;
  margin-right: ${({theme}) => theme.spacing.xs};
  font-size: 0.8em;
  min-width: 4em;
  text-align: right;
`

const Token = styled.span`
  font-weight: 600;
`

const DEFAULT = "Joel is";

const title = "Sentiment Analysis"

function addToUrl(output, choice) {
  if ('history' in window) {
    window.history.pushState(null, null, '?text=' + encodeURIComponent(output + (choice || '')))
  }
}

function loadFromUrl() {
  const params =
      document.location.search.substr(1).split('&').map(p => p.split('='));
  const text = params.find(p => p[0] === 'text');
  return Array.isArray(text) && text.length === 2 ?  decodeURIComponent(text.pop()) : null;
}

function trimRight(str) {
  return str.replace(/ +$/, '');
}

const DEFAULT_MODEL = "345M"

const description = (
  <span>
Enter some initial text with a "[MASK]" token and the model will generate the most likely words to substitute for "[MASK]".
You can click on one of those words to choose it and continue or just keep typing.
Click the left arrow at the bottom to undo your last choice.
  </span>
)

class App extends React.Component {

  constructor(props) {
    super(props)

    this.currentRequestId = 0;

    this.state = {
      output: loadFromUrl() || DEFAULT,
      words: null,
      logits: null,
      probabilities: null,
      loading: false,
      error: false,
      model: DEFAULT_MODEL
    }

    this.choose = this.choose.bind(this)
    this.debouncedChoose = _.debounce(this.choose, 1000)
    this.setOutput = this.setOutput.bind(this)
    this.runOnEnter = this.runOnEnter.bind(this)
  }

  setOutput(evt) {
    const value = evt.target.value
    if (value) { // TODO(michaels): I shouldn't need to do this
      const trimmed = trimRight(value);

      const loading = trimmed.length > 0 && trimmed.includes("[MASK]");

      this.setState({
          output: value,
          words: null,
          logits: null,
          probabilities: null,
          loading: loading
      })

      this.debouncedChoose()
    }
  }

  createRequestId() {
    const nextReqId = this.currentRequestId + 1;
    this.currentRequestId = nextReqId;
    return nextReqId;
  }

  componentDidMount() {
    this.choose()
    if ('history' in window) {
      window.addEventListener('popstate', () => {
        const fullText = loadFromUrl();
        const doNotChangeUrl = fullText ? true : false;
        const output = fullText || DEFAULT;
        this.setState({
          output,
          loading: true,
          words: null,
          logits: null,
          probabilities: null,
          model: this.state.model
        }, () => this.choose(undefined, doNotChangeUrl));
      })
    }
  }

  choose(choice = undefined, doNotChangeUrl) {
    // strip trailing spaces
    const trimmedOutput = trimRight(this.state.output);
    if (trimmedOutput.length === 0) {
      this.setState({ loading: false });
      return;
    }

    if (trimmedOutput.includes("[MASK]")) {
      this.setState({ loading: true, error: false })

      const payload = {
        sentence: trimmedOutput,
        next: choice,
        numsteps: 5,
        model_name: this.state.model
      }

      const currentReqId = this.createRequestId();
      const endpoint = `${API_ROOT}/predict/masked-lm`

      if ('history' in window && !doNotChangeUrl) {
        addToUrl(this.state.output, choice);
      }

      fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
      })
      .then(response => response.json())
      .then(data => {
        if (this.currentRequestId === currentReqId) {
          // If the user entered text by typing don't overwrite it, as that feels
          // weird. If they clicked it overwrite it
          const output = choice === undefined ? this.state.output : data.output
          this.setState({...data, output, loading: false})
        }
      })
      .catch(err => {
        console.error('Error trying to communicate with the API:', err);
        this.setState({ error: true, loading: false });
      });
    }
  }

  // Temporarily (?) disabled
  runOnEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        this.choose()
    }
  }

  render() {

    const { responseData, requestData, interpretData, interpretModel, attackData, attackModel } = this.props
    var t = requestData;
    // const tokens = t['sentence'].split(' '); // this model expects space-separated inputs
    const tokens = ["bah", "bah", "black", "sheep"];
    return (
        <Wrapper classname="model">
        <ModelArea className="model__content answer">
          <h2><span>Language Modeling</span></h2>
          <p><span>{description}</span></p>

          <InputOutput>
            <InputOutputColumn>
              <FormLabel>Sentence:</FormLabel>
                <TextInput type="text"
                          autosize={{ minRows: 5, maxRows: 10 }}
                          value={this.state.output}
                          onChange={this.setOutput}/>
                {this.state.loading ? (
                  <Loading>
                    <img src="/assets/loading-bars.svg" width="25" height="25" alt="loading" />
                    <LoadingText>Loading</LoadingText>
                  </Loading>
                ) : null}
                {this.state.error ? (
                  <Error>
                    <span role="img" aria-label="warning">️⚠</span> Something went wrong. Please try again.
                  </Error>
                ) : null}
            </InputOutputColumn>
            <InputOutputColumn>
              <FormLabel>Top Predictions:</FormLabel>
              <Choices output={this.state.output}
                      choose={this.choose}
                      logits={this.state.logits}
                      words={this.state.words}
                      probabilities={this.state.probabilities}
                      hidden={this.state.loading}/>
            </InputOutputColumn>
          </InputOutput>
        </ModelArea>
    <OutputField>
      <Accordion accordion={false}>
          <SaliencyComponent interpretData={interpretData} input1Tokens={tokens}  interpretModel = {interpretModel} requestData = {requestData} interpreter={GRAD_INTERPRETER} task={title}/>
          <SaliencyComponent interpretData={interpretData} input1Tokens={tokens}  interpretModel = {interpretModel} requestData = {requestData} interpreter={IG_INTERPRETER} task={title}/>
          <SaliencyComponent interpretData={interpretData} input1Tokens={tokens} interpretModel = {interpretModel} requestData = {requestData} interpreter={SG_INTERPRETER} task={title}/>
      </Accordion>
    </OutputField>
    </Wrapper>
    )
  }
}


const formatProbability = prob => {
  prob = prob * 100
  return `${prob.toFixed(1)}%`
}

const Choices = ({output, logits, words, choose, probabilities}) => {
  if (!words) { return null }

  const lis = words[0].map((word, idx) => {
    const prob = formatProbability(probabilities[0][idx])

    // get rid of CRs
    const cleanWord = word.replace(/\n/g, "↵")

    return (
      <ListItem key={`${idx}-${cleanWord}`}>
        <ChoiceItem onClick={() => choose(word)}>
          <Probability>{prob}</Probability>
          {' '}
          <Token>{cleanWord}</Token>
        </ChoiceItem>
      </ListItem>
    )
  })

  const goBack = () => {
    window.history.back();
  }

  const goBackItem = (
    <ListItem key="go-back">
      {'history' in window ? (
        <UndoButton onClick={goBack}>
          <Probability>←</Probability>
          {' '}
          <Token>Undo</Token>
        </UndoButton>
      ) : null}
    </ListItem>
  )

  return (
    <ChoiceList>
      {lis}
      {goBackItem}
    </ChoiceList>
  )
}

const modelProps = {apiUrl, apiUrlInterpret, apiUrlAttack, title, description, Choices, App}

export default withRouter(props => <App {...props} {...modelProps}/>)
