// @flow
import React from 'react'
import { render } from 'react-dom'
import { createStore, compose, applyMiddleware } from 'redux'
import { Provider, connect } from 'react-redux'
import UUID from 'uuid-js'

import 'normalize.css/normalize.css'
import 'font-awesome/css/font-awesome.css'
import './main.styl'


// States
type Message = { id: string, text: string };
type Channel = Array<Message>;
const new_channel = () => [];

type State = {
  channels: { [name: string]: Channel },
  current_channel: string
};
const init: State = (_ => {
  // Accept permalink
  const names = ['general', 'random', 'notice'];
  const channels: Object = names.map(k => ({[k]: new_channel()})).reduce((l, r) => Object.assign(l, r))

  let init = location.hash.slice(1);
  if (!init) { init = 'general'; }
  if (!(init in channels)) { channels[init] = new_channel(); }

  return { channels, current_channel: init };
})();

type Action = {
  type: 'CreateMsg'|'ReceiveMsg'|'CreateChannel'|'ChangeChannel',
  channel: string,
  message?: Message // Only used with 'CreateMsg'|'ReceiveMsg'
};
type Dispatch = (action: Action) => Action;

const reducer = (state: State = init, action: Action): State => {
  switch (action.type) {
  case 'CreateMsg':
  case 'ReceiveMsg': {
    // Validate action
    const msg = action.message;
    if (msg == null) { return state; }

    const newstate = Object.assign({}, state);
    const channel = newstate.channels[action.channel];
    channel.push(msg);
    return newstate; }
  case 'CreateChannel': {
    if (action.channel in state.channels) { return state; }

    const newstate = Object.assign({}, state);
    newstate.channels[action.channel] = [];
    return newstate; }
  case 'ChangeChannel':
    return { channels: state.channels, current_channel: action.channel };
  default:
    return state;
  }
}

// Communication (1)
const socket = new WebSocket(`ws://${location.host}/api`);

// 어플리케이션 에서 내부적으로 'CreateMsg' 이벤트가 발생하였을경우, 타입만
// 'ReceiveMsg' 로 바꾼뒤 그대로 직렬화하여 서버로 전송한다.
const server = store => next => action => {
  if (action.type === 'CreateMsg') {
    const newaction = Object.assign({}, action);
    newaction.type = 'ReceiveMsg';
    socket.send(JSON.stringify(newaction));
  }
  return next(action);
};

// View
type Props = {
  state: State,
  submit: (channel: string, message: string) => Action,
  createChannel: (channel: string) => Action,
  changeChannel: (channel: string) => Action,
};

const Lines = (() => {
  let lines;
  return React.createClass({
    componentDidUpdate(params) {
      // TODO: 남이 메세지를 보냈을때도 스크롤이 확확 올라가버리면 곤란함
      lines.scrollTop = lines.scrollHeight - lines.clientHeight;
    },
    render() {
      return <ul ref={n => lines = n}>
        { this.props.messages.map(({ id, text }: Message) => (
          <li key={id}>
            <span className='nick'>오리너구리</span>
            <span className='content'>{text}</span>
            <span className='control'>
              <i className='fa fa-pencil'/>
              &nbsp;
              <i className='fa fa-trash-o'/>
            </span>
          </li>
        )) }
      </ul>;
    }
  });
})();

const View = ({ state, submit, createChannel, changeChannel }: Props) => {
  let field_channel, field;

  const onSubmit = e => {
    e.preventDefault();
    if (!field.value) { return; }

    submit(state.current_channel, field.value);
    field.value = '';
  };

  const onCreateChannel = e => {
    e.preventDefault();
    const ch = field_channel.value;
    if (!ch) { return; }
    field_channel.value = ''

    createChannel(ch);
    changeChannel(ch);
  }

  return <div id='chat'>
    <div id='channels'>
      <form onSubmit={onCreateChannel}>
        <input className='field' placeholder='새 채널' ref={n=>field_channel=n}/>
      </form>
      <ul>
        { Object.keys(state.channels).map(ch => (
          <li id={ch === state.current_channel ? 'current' : null}
            key={ch} onClick={_ => changeChannel(ch)}>{ch}</li>
        )) }
      </ul>
    </div>
    <div id='buffer'>
      <Lines messages={state.channels[state.current_channel]}/>
      <form onSubmit={onSubmit}>
        <input className='field' placeholder='친구들과 이야기하세요!' ref={n=>field=n}/>
      </form>
    </div>
  </div>;
};

// App
type StateProps = { state: State };
type DispatchProps = $Diff<Props, StateProps>;

const mapState = (state: State): StateProps => ({ state });
const mapDispatch = (dispatch: Dispatch): DispatchProps => ({
  submit: (channel, text) => dispatch({
    type: 'CreateMsg', channel, message: { id: UUID.create().toString(), text }
  }),
  createChannel: channel => dispatch({ type: 'CreateChannel', channel }),
  changeChannel: channel => dispatch({ type: 'ChangeChannel', channel }),
});
const App = connect(mapState, mapDispatch)(View);

const store = createStore(reducer, compose(
  applyMiddleware(server),
  window.devToolsExtension ? window.devToolsExtension() : f => f
));

// Communication (2)
socket.onmessage = event => {
  // 서버로부터 전달받은 action 객체를 그대로 dispatch 한다
  store.dispatch(JSON.parse(event.data));
}

// Generate permalink
store.subscribe(() => {
  location.hash = store.getState().current_channel;
});


// Entry Point
render(
  <Provider store={store}>
    <App/>
  </Provider>,
  document.getElementById('target')
);
