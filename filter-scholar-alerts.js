/*Parse the body for the email which cites papers of a specific author*/
function parse_citations_email(plainBody) {
  var lines = plainBody.split(/\r?\n/);

  // Go over the plain text lines and get the papers title, url, authors, and venue.
  var paper_lines = []
  var raw_papers = []
  var obtained_main_content = false
  var i = 0
  while (i < lines.length){
    var line = lines[i].trim();
    // At the end of the email is a line about why you were sent the email. Skip it.
    if (line.includes('This message was sent by Google Scholar')){
      break
    }
    // If there is a empty line its a new paper 
    if (line == ''){
      if (paper_lines.length != 0){
        raw_papers.push(paper_lines)
        // console.log(paper_lines)
      }
      paper_lines = []
      obtained_main_content = false
      i += 1
    }
    else {
      // The "Cites" line comes after the paper title, author, and snippet
      if (line.includes('Cites:')){
        const index = line.indexOf("Cites:");
        paper_lines.push(line.slice(index))
        obtained_main_content = true
      }
      if (!obtained_main_content) {
        paper_lines.push(line)
      }
      i += 1
    }
    //
  }

  // Go over the papers and get their title, url, metadata (authors, venue, year), and snippet
  // This assumes that the google scholar papers contain title, url, author and year
  var parsed_papers = {}
  for (let i = 0; i < raw_papers.length; i++) {
    raw_lines = raw_papers[i]
    // console.log(raw_lines)
    var title_lines = []
    var url_line = ''
    var metadata_lines = []
    var snippet_lines = []
    var got_url = false
    var got_metadata = false
    const metadata_pattern = /\s\d{4}$/;  // Check if a line ends with 4 digits, extracts metadata like author, venue, and year.
    for (let j = 0; j < raw_lines.length; j++){
      line = raw_lines[j]
      if (line.startsWith('<https:')){
        url_line = line.slice(1,-1)
        got_url = true
        continue
      }
      if (!got_url) {
        title_lines.push(line)
      }
      else{
        if (!got_metadata){ // The lines after the url is metadata until the year of publication
          metadata_lines.push(line)
          if (metadata_pattern.test(line)){
            got_metadata = true
          }
        }
        else{
          snippet_lines.push(line)
        }
      }
    }
    title_text = title_lines.join(" ")
    // The metadata and snippet parsing isnt perfect so sometimes the snippet is empty. Swap the two when this happens
    if (snippet_lines.length <= 1){
      metadata_text = ""
      snippet_text = metadata_lines.join(" ")
      cites_text = ""
    } else {
      metadata_text = metadata_lines.join(" ")
      // Keep all the lines except the last for the snippet text
      snippet_text = snippet_lines.slice(0, -1).join(" ")
      // The last line of the snippet says which paper of the author was cited.
      // The cites text can also be cut off - dint bother to get accumulate it to the end because it makes parsing harder
      // Also get rid of the "Cites:" at the start
      cites_text = snippet_lines.slice(-1)[0]
      cites_text = cites_text.slice(6).trim()
    }
    var paper_dict = {
      "title": title_text,
      "url": url_line,
      "metadata": metadata_text,
      "cites": cites_text,  
      "snippet": snippet_text
    }
    parsed_papers[title_text] = paper_dict
  }

  return parsed_papers
}

/*Given a dictionary with authorname mapped to all the papers citing their work
count up papers which are citing multiple authors and gather one dict*/
function collate_author_papers(authorname2parsed_papers){
  // Gather the papers and the number of times diff authors papers are cited by them
  var title2authors = {}
  var title2updated_parsed_papers = {}
  for (const [authorname, title2parsed_papers] of Object.entries(authorname2parsed_papers)) {
    for (const [title, parsed_paper] of Object.entries(title2parsed_papers)) {
      if (title in title2authors) {
            title2authors[title].push(authorname);
        } else {
            title2authors[title] = [authorname];
        }
      if (title in title2updated_parsed_papers){
        // console.log(parsed_paper['cites'])
        if (parsed_paper['cites'] == ''){ // Only add the cited papers title if it was parsed correctly
          title2updated_parsed_papers[title]['cites'].push(`Cites ${authorname}`);
        } else {
          title2updated_parsed_papers[title]['cites'].push(`Cites ${authorname}: ${parsed_paper['cites']}`);
        }
      } else {
        // console.log(parsed_paper)
        title2updated_parsed_papers[title] = parsed_paper
        if (parsed_paper['cites'] == ''){
          title2updated_parsed_papers[title]['cites'] = [`Cites ${authorname}`];
        } else {
          title2updated_parsed_papers[title]['cites'] = [`Cites ${authorname}: ${parsed_paper['cites']}`];
        }
      }
    }
  }
  
  // Get the papers sorted in order of the citations.
  // todo: need to sort the single citation papers by author
  var sorted_titles = Object.keys(title2authors).sort((a, b) => {
        // Sort in decreasing order of list length
        return title2authors[b].length - title2authors[a].length;
    })

  var sorted_papers = []
  for (let j = 0; j < sorted_titles.length; j++){
    sorted_papers.push(title2updated_parsed_papers[sorted_titles[j]])
  }

  return sorted_papers
}

/* Format the list of sorted paper dicts*/
function format_citations_email(sorted_paper_dicts) {
    let formatted_papers = '';
    
    for (let i = 0; i < sorted_paper_dicts.length; i++) {
        const paper = sorted_paper_dicts[i];
        
        formatted_papers += '<div class="paper">\n';
        formatted_papers += `    <p><strong><a href="${paper.url}">${paper.title}</a></strong></p>\n`;
        if (paper.metadata != ''){
          formatted_papers += `    <p><i>${paper.metadata}</i></p>\n`;
        }
        formatted_snippet = format_snippet_width(paper.snippet, 120)
        formatted_papers += `    <p>${formatted_snippet}</p>\n`;
        formatted_papers += '    <ul>\n';
        for (let j = 0; j < paper.cites.length; j++) {
            formatted_papers += `        <li>${paper.cites[j]}</li>\n`;
        }
        formatted_papers += '    </ul>\n';
        formatted_papers += '</div>\n';
    }
    
    return formatted_papers;
}

function format_snippet_width(snippet, charsPerLine) {
    let formattedSnippet = '';
    let currentLine = '';
    const words = snippet.split(' ');
    
    for (let i = 0; i < words.length; i++) {
        if (currentLine.length + words[i].length + 1 <= charsPerLine) {
            currentLine += (currentLine ? ' ' : '') + words[i];
        } else {
            formattedSnippet += currentLine + '<br>';
            currentLine = words[i];
        }
    }
    
    if (currentLine) {
        formattedSnippet += currentLine;
    }
    
    return formattedSnippet;
}

function mergeRecentScholarAlerts() {
  // COnstruct a search query for emails from scholar alerts in the past 24 hours
  var senderEmail = 'scholaralerts-noreply@google.com';
  var now = new Date();
  var yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1); // Set to 24 hours ago
  var formattedNow = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy/MM/dd");
  var formattedYesterday = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), "yyyy/MM/dd");
  var searchQuery = 'from:' + senderEmail + ' after:' + formattedYesterday + ' before:' + formattedNow;

  // Get the alerts from the past day
  var threads = GmailApp.search(searchQuery);

  // Go over the emails and get the papers across authors and merge them
  var mergedBody = '';

  mergedBody += '<html><body>';
  mergedBody += `<h1>Google Scholar Alerts Digest for ${now}</h1>`;
  var author2parsed_papers = {}
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var subject = message.getSubject()
      // Only parse the papers 
      if (subject.includes('citations to articles')){
        message_body = message.getPlainBody(); // This is the plain text body
        parsed_paper_dicts = parse_citations_email(message_body)
        const index = subject.indexOf("by ");
        author_name = subject.slice(index+3).trim()
        author2parsed_papers[author_name] = parsed_paper_dicts
      }
      else{ // After the above case is setup add code to handle people subscribed to authors and individual papers (mostly just concat all the papers into one email)
        continue
      }
      console.log(author_name)
      // mergedBody += '<h3>From: ' + message.getFrom() + '</h3>';
      // mergedBody += '<p>Date: ' + message.getDate() + '</p>';
      // mergedBody += '<p>Subject: ' + message.getSubject() + '</p>';
      //message_body = message.getPlainBody(); // This is the plain text body
      // mergedBody += '<div>' + message_body + '</div>';
      // mergedBody += '<hr>';
    }
  }
  
  // Count the number subscribed authors per paper and return it in sorted order
  sorted_paper_dicts = collate_author_papers(author2parsed_papers)
  paper_body = format_citations_email(sorted_paper_dicts)
  mergedBody += paper_body
  mergedBody += '</body></html>';
  var merged_subject = `Google Scholar Alerts: Authors Citations Digest for ${now}`;
  if (mergedBody !== '<html><body></body></html>') {
    GmailApp.sendEmail(Session.getActiveUser().getEmail(), merged_subject, '', {
      htmlBody: mergedBody
    });
    // GmailApp.sendEmail(Session.getActiveUser().getEmail(), merged_subject, mergedBody);
    Logger.log('Merged email with recent alerts sent successfully.');
  } else {
    Logger.log('No matching emails found.');
  }
}