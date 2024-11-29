/*Config for the script*/
global_config = {
  // How far back each digest should look
  'past_day_range': 3,
  // How many papers to include in one part of the digest, more than 200 tends to hit length limits of emails
  'papers_per_merged_email': 200,
  // Search for the sender of the email
  'senderEmail': 'scholaralerts-noreply@google.com',
  // After sending the digest should the email get marked as unread
  'mark_as_unread': true
}

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
function format_citations_email(sorted_paper_dicts, skip_snippet_cites = false) {
    let formatted_papers = '<div style="font-family:arial,sans-serif;font-size:13px;line-height:16px;color:#222;width:100%;max-width:600px">\n';
    formatted_papers += '<h3 style="font-weight:lighter;font-size:18px;line-height:20px;"></h3>\n<h3 style="font-weight:normal;font-size:18px;line-height:20px;"></h3>'
    
    for (let i = 0; i < sorted_paper_dicts.length; i++) {
        const paper = sorted_paper_dicts[i];
        
        formatted_papers += `<h3 style="font-weight:normal;margin:0;font-size:17px;line-height:20px;"><a href=${paper.url} class="gse_alrt_title" style="font-size:17px;color:#1a0dab;line-height:22px">${paper.title}</a></h3>`;
        if (paper.metadata != ''){
          formatted_papers += `<div style="color:#006621;line-height:18px">${paper.metadata}</div>`;
        }
        if (!skip_snippet_cites){  // The script runs into a max email length limit if collating over multiple days
          formatted_snippet = format_snippet_width(paper.snippet, 100)
          formatted_papers += `<div class="gse_alrt_sni" style="line-height:17px">${formatted_snippet}</div>`;
        }
        if (paper.cites.length != 0){
          formatted_papers += '<table cellpadding="0" cellspacing="0" border="0" style="padding:8px 0>'
          if (skip_snippet_cites){ // The script runs into a max email length limit if collating over multiple days
            formatted_papers += `<tr><td style="line-height:18px;font-size:12px;padding-right:8px;" valign="top">•</td><td style="line-height:18px;font-size:12px;mso-padding-alt:8px 0 4px 0;"><span style="mso-text-raise:4px;">Cites: ${paper.cites.length} subscribed authors.</span></td></tr>`
          } else {
            for (let j = 0; j < paper.cites.length; j++) {            
              var text_row = `<tr><td style="line-height:18px;font-size:12px;padding-right:8px;" valign="top">•</td><td style="line-height:18px;font-size:12px;mso-padding-alt:8px 0 4px 0;"><span style="mso-text-raise:4px;">${paper.cites[j]}</span></td></tr>`
              formatted_papers += text_row
            }
          }
          formatted_papers += '</table>'
        }
        formatted_papers += '<br>';
    }
    formatted_papers += '</div>'
    return formatted_papers;
}

/*Truncate the snippet to charsPerLine*/
function format_snippet_width(snippet, charsPerLine) {
    let formattedSnippet = '';
    let currentLine = '';
    const words = snippet.split(/\s+/);
    
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

/*Given a batch of paper dicts, format and send them - this can be called from 
batch_send_citation_email or mergeRecentScholarAlerts with no batching is needed*/
function send_citation_email(batch_paper_dicts, total_citing_papers, total_authors, total_unique_papers, batch_idx=0){
  var now = new Date();
  var pretty_now = Utilities.formatDate(now, Session.getScriptTimeZone(), "EEE MMM dd yyyy");
  var paper_body = format_citations_email(batch_paper_dicts)
  var merged_citations_body = '';
  merged_citations_body += '<html><body>';
  merged_citations_body += '<!doctype html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>body{background-color:#fff}.gse_alrt_title{text-decoration:none}.gse_alrt_title:hover{text-decoration:underline} @media screen and (max-width: 599px) {.gse_alrt_sni br{display:none;}}</style></head>'
  if (batch_idx == 0){ // If we are batching then batch_idx >= 1 and we will include it in the email.
    merged_citations_body += `<h2>Collated ${total_citing_papers} citations to ${total_authors} authors into ${total_unique_papers} unique papers</h2>`;
  } else {
    merged_citations_body += `<h2>Collated ${total_citing_papers} citations to ${total_authors} authors into ${total_unique_papers} unique papers - Part ${batch_idx}, ${batch_paper_dicts.length}/${total_unique_papers}</h2>`;
  }
  merged_citations_body += paper_body
  merged_citations_body += '</body></html>';
  if (batch_idx == 0){ // If we are batching then batch_idx >= 1 and we will include it in the email.
    var merged_subject = `Google Scholar Author Citations Digest for ${pretty_now}`;
  } else {
    var merged_subject = `Google Scholar Author Citations Digest for ${pretty_now} - Part ${batch_idx}`;
  }
  if (merged_citations_body !== '<html><body></body></html>') {
    GmailApp.sendEmail(Session.getActiveUser().getEmail(), merged_subject, '', {
      htmlBody: merged_citations_body
    });
    // GmailApp.sendEmail(Session.getActiveUser().getEmail(), merged_subject, mergedBody);
    Logger.log('Merged email with recent alerts sent successfully.');
  } else {
    Logger.log('No matching emails found.');
  }
}

/* Send the emails in parts of 200 or so else the script runs into a max email length limit*/
function batch_send_citation_email(sorted_paper_dicts, total_citing_papers, total_authors, total_unique_papers, paper_per_email = 250){
  var start = 0
  var batch_idx = 1
  while (start+paper_per_email < sorted_paper_dicts.length){
    var batch_papers = sorted_paper_dicts.slice(start, start+paper_per_email)
    send_citation_email(batch_papers, total_citing_papers, total_authors, total_unique_papers, batch_idx)
    start += paper_per_email
    batch_idx += 1
  }
  if (start < sorted_paper_dicts.length){ // handle the last batch
    var batch_papers = sorted_paper_dicts.slice(start)
    send_citation_email(batch_papers, total_citing_papers, total_authors, total_unique_papers, batch_idx)
  }
}

function mergeRecentScholarAlerts() {
  // Construct a search query for emails from scholar alerts in the past_day_range
  var now = new Date();
  var start_date = new Date(now);
  start_date.setDate(now.getDate() - global_config.past_day_range); // Set to past day range
  var formatted_startdate = Utilities.formatDate(start_date, Session.getScriptTimeZone(), "yyyy/MM/dd");
  var searchQuery = 'from:' + global_config.senderEmail + ' after:' + formatted_startdate;

  // Get the alerts from the past day
  var threads = GmailApp.search(searchQuery);

  // Go over the emails and get the papers across authors and merge them
  var author2parsed_papers = {}
  var total_citing_papers = 0
  var merged_new_articles_body = ''
  var new_article_author_count = 0
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var subject = message.getSubject()
      // Mark the message as read
      if (global_config.mark_as_unread){
        message.markRead()
      }
      console.log(subject)
      // Only parse the papers 
      if (subject.includes('citations to articles') || subject.includes('citation to articles') || subject.includes('your articles')){
        message_body = message.getPlainBody(); // This is the plain text body
        titles2parsed_paper_dict = parse_citations_email(message_body)
        if (subject.includes('citations to articles') || subject.includes('citation to articles')){
          const index = subject.indexOf("by ");
          author_name = subject.slice(index+3).trim()
        } else {
          author_name = 'You'
        }
        // The author can already be present if we collate across multiple days of updates
        if (author_name in author2parsed_papers){
          author2parsed_papers[author_name] = Object.assign(author2parsed_papers[author_name], titles2parsed_paper_dict)
        } else {
          author2parsed_papers[author_name] = titles2parsed_paper_dict
        }
        total_citing_papers += Object.keys(titles2parsed_paper_dict).length
      }
      // todo: Aggregate across authors for their new papers in case they have multiple new ones in a short time
      // todo: Batch and send these as well; this will need these to be parsed into papers too
      else{
        merged_new_articles_body += '<p>' + message.getSubject() + '</p>';
        message_body = message.getBody();
        merged_new_articles_body += '<div>' + message_body + '</div>';
        merged_new_articles_body += '<hr>';
        new_article_author_count += 1
      }
    }
  }
  
  var pretty_now = Utilities.formatDate(now, Session.getScriptTimeZone(), "EEE MMM dd yyyy");
  // Count the number subscribed authors per paper and return it in sorted order
  sorted_paper_dicts = collate_author_papers(author2parsed_papers)
  total_authors = Object.keys(author2parsed_papers).length
  total_unique_papers = sorted_paper_dicts.length

  // If the number of papers is large then batch and send, else just send
  if (total_unique_papers <= global_config.papers_per_merged_email){
    send_citation_email(sorted_paper_dicts, total_citing_papers, total_authors, total_unique_papers, 0)
  } else {
    batch_send_citation_email(sorted_paper_dicts, total_citing_papers, total_authors, total_unique_papers, global_config.papers_per_merged_email)
  }
  
  // Create one merged body for the new articles email.
  merged_new_articles_email = '<html><body>';
  merged_new_articles_email += `<h2>Collated new articles from ${new_article_author_count} authors</h2>`;
  merged_new_articles_email += merged_new_articles_body
  merged_new_articles_email += '</body></html>';
  var merged_subject = `Google Scholar New Articles Digest for ${pretty_now}`;
  if (merged_new_articles_email !== '<html><body></body></html>') {
    GmailApp.sendEmail(Session.getActiveUser().getEmail(), merged_subject, '', {
      htmlBody: merged_new_articles_email
    });
    // GmailApp.sendEmail(Session.getActiveUser().getEmail(), merged_subject, mergedBody);
    Logger.log('Merged email with recent alerts sent successfully.');
  } else {
    Logger.log('No matching emails found.');
  }
}