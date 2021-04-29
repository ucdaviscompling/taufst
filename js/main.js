// modified from the Tau Prolog sandbox

var try_program = "";
var try_goal = "";
var try_goals = [""];
var try_stack = 0;
var session = null;
var code = null;
var curr_code_text = "";
var query = null;
var reset = 0;
var styles = {};
var qnum = 1;
var LIMIT = 1000;

window.addEventListener("load", function() {
	code = CodeMirror(document.querySelector('#code'), {
		lineNumbers: true,
		tabSize: 2,
		value: '',
		mode: 'prolog',
		theme: 'tau',
		placeholder: 'Enter FST specification.'
	});
	code.setSize("100%", "100%");
	
	document.getElementById("query").addEventListener('focus', (event) => {
		reconsult();
	}, true);  

	query = CodeMirror(document.getElementById("query"), {
		lineNumbers: false,
		theme: "tau",
		placeholder: "Enter a query.",
		mode: "prolog",
		background: "#fff",
	});
	query.setSize("100%", query.defaultTextHeight() + 2 * 4);
	query.on("beforeChange", function(instance, change) {
		var newtext = change.text.join("").replace(/\n/g, "");
		change.update(change.from, change.to, [newtext]);
		return true;
	});
	query.on("keyHandled", try_tau_prolog);
});

function loadFile() {
	var input = document.createElement("input");
	input.setAttribute("type", "file");
	input.click();
	input.onchange = e => { 
		var file = e.target.files[0];
		var reader = new FileReader();
		reader.readAsText(file,'UTF-8');
		reader.onload = readerEvent => {
			var content = readerEvent.target.result;
			code.setValue(content);
		}
		document.getElementById("fileName").value = e.target.files[0].name;
	}
}

function saveFile() {
	fileName = document.getElementById("fileName").value;
	if(fileName == "") {
		fileName = "my_transitions.pl";
		document.getElementById("fileName").value = fileName;
	}
	text = code.getValue();
	//text = text.replace(/\n/g, "\r\n");
    var blob = new Blob([text], { type: "text/plain"});
    var anchor = document.createElement("a");
    anchor.download = fileName;
    anchor.href = window.URL.createObjectURL(blob);
    anchor.target ="_blank";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

function newFile() {
	if(confirm("Clear editor? Unsaved changes will be lost.")) {
		code.setValue("");
		document.getElementById("fileName").value = "";
	}
}

function consultFST() {
	var fststr = `
	:- use_module(library(lists)).

	% This is what we use to run the transducer
	fst(Input, Output) :-
	  initial(State),
	  go(State, Input, Output, 0).
	
	% This is how we know that we've reached the end of the run
	go(CurrentState, [], [], _) :-
	  final(CurrentState).
	
	% Use a transition with no eps on either side
	go(CurrentState, [A|InString], [B|OutString], _) :-
	  transition(CurrentState, A, NextState, B),
	  A \\= eps,
	  B \\= eps,
	  go(NextState, InString, OutString, 0).
	
	% use a transition with eps on the input side
	go(CurrentState, InString, [B|OutString], _) :-
	  transition(CurrentState, eps, NextState, B),
	  B \\= eps,
	  go(NextState, InString, OutString, 0).
	
	% use a transition with eps on the output side
	go(CurrentState, [A|InString], OutString, _) :-
	  transition(CurrentState, A, NextState, eps),
	  A \\= eps,
	  go(NextState, InString, OutString, 0).
	
	% use a transition with eps on both sides
	go(CurrentState, InString, OutString, N) :-
	  transition(CurrentState, eps, NextState, eps),
	  N < 10,
	  M is N + 1,
	  go(NextState, InString, OutString, M).
	
	% FSA is an FST with the same input and output
	fsa(X) :- fst(X, X).
	
	% An FSA transition is a transition with the
	% same input and output symbol
	transition(State, Sym, NextState, Sym) :- transition(State, Sym, NextState).
  `;

	var parsed = session.consult(fststr);
}

function getWriteOptions() {
	return {
		session: session,
		ignore_ops: document.getElementById("ignore_ops").checked,
		quoted: document.getElementById("quoted").checked,
		numbervars: document.getElementById("numbervars").checked
	};
}

function try_tau_prolog( cm, msg, e ) {
	// Down
	if( e.keyCode === 40 ) {
		try_stack++;
		if( try_stack >= try_goals.length ) try_stack = 0;
		query.setValue(try_goals[try_stack]);
	// Up
	} else if( e.keyCode === 38 ) {
		try_stack--;
		if( try_stack < 0 ) try_stack = try_goals.length - 1;
		query.setValue(try_goals[try_stack]);
	// Enter
	} else if( e.keyCode === 13 ) {
		try {
			var raw_program = code.getValue();
			var raw_goal = query.getValue();
			if( try_program !== raw_program || try_goal !== raw_goal || reset ) {
				new_block(raw_goal);
				try_goals.push( raw_goal );
				try_stack = try_goals.length - 1;
				reset = 0;
				
				if( session == null ) {
					session = pl.create(parseInt(document.getElementById("limit").value));
					consultFST();
					session.streams.user_output = new pl.type.Stream({
						put: function( text, _ ) {
							new_message( text );
							return true;
						},
						flush: function() {
							return true;
						} 
					}, "write", "user_output", "text", false, "eof_code");
					session.standard_output = session.streams["user_output"];
					session.current_output = session.streams["user_output"];
				}
				session.limit = parseInt(document.getElementById("limit").value);
				var q = session.query( raw_goal );
				if( q !== true ) {
					try_answer( 'error parsing query: ' + q.args[0], true );
					return;
				}
			}
		} catch( ex ) {
			try_answer( 'javascript error: ' + ex.toString() + '<div class="report-github"><a href="https://github.com/jariazavalverde/tau-prolog/issues" target="_blank">Report error on GitHub</a></div>', true );
			return;
		}
		session.answer( try_answer );
	}
	try_program = raw_program;
	try_goal = raw_goal;
}

function escapeHtml(unsafe) {
	return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function new_block(last) {
	var output = document.getElementById( "output" );
    output.innerHTML = "<div class=\"last\">Query " + qnum.toString() + ": " + last + "</div>" + output.innerHTML;
	qnum += 1;
}

function new_message(msg) {
	msg = msg.replace(/\n/g, "<br />");

	var output = document.getElementById( "output" );
	output.innerHTML = "<div class=\"goal\"><div class=\"write\">" + msg + "</div><div class=\"sep\"></div></div>" + output.innerHTML;
}

function try_answer( answer, format ) {
	var output = document.getElementById( "output" );
	output.innerHTML = "<div class=\"goal\"><div class=\"answer\">" + (format ? answer : escapeHtml(pl.format_answer( answer, session, getWriteOptions() )) ) + "</div></div>" + output.innerHTML;
}


function add(text) {
	code.setValue(text + "\n" + code.getValue());
}


function reconsult() {
	//document.getElementById("reconsult").value = "Reconsult program";
	var raw_program = code.getValue();
	if(raw_program == curr_code_text) {
		return;
	}
	curr_code_text = raw_program;
	if( session == null ) {
		console.log("new session")
		session = pl.create(parseInt(document.getElementById("limit").value));
		consultFST();
		session.streams.user_output = new pl.type.Stream({
			put: function( text, _ ) {
				new_message( text );
				return true;
			},
			flush: function() {
				return true;
			} 
		}, "write", "user_output", "text", false, "eof_code");
		session.standard_output = session.streams["user_output"];
		session.current_output = session.streams["user_output"];
	}
	var c = session.consult( raw_program );
	reset = 1;
	new_block("consult");
	if( c !== true && c.args )
		try_answer( 'error parsing program: ' + c.args[0], true );
	else if( c === false )
		try_answer( 'parsing program: fail!', true );
	else
		try_answer( 'parsing program: ok!', true );
	var warnings = session.get_warnings();
	for( var i = warnings.length-1; i >= 0; i-- )
		try_answer( 'warning parsing program: ' + warnings[i].toString( getWriteOptions() ), true );
}
