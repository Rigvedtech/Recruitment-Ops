/**
 * Decodes HTML entities in a string
 */
export function decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

/**
 * Formats email body content for display
 */
export function formatEmailBody(body: string, contentType: string = 'text'): string {
    if (!body) return 'No content available';
    
    if (contentType === 'html' || isHtmlContent(body)) {
        // Decode HTML entities first
        const decodedBody = decodeHtmlEntities(body);
        
        // Clean up common email formatting issues
        return decodedBody
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
            .replace(/<meta[^>]*>/gi, '') // Remove meta tags
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '') // Remove head section
            .replace(/<body[^>]*>/gi, '') // Remove body opening tag
            .replace(/<\/body>/gi, '') // Remove body closing tag
            .replace(/<html[^>]*>/gi, '') // Remove html opening tag
            .replace(/<\/html>/gi, '') // Remove html closing tag
            .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
            .replace(/&amp;/g, '&') // Replace ampersand entities
            .replace(/&quot;/g, '"') // Replace quote entities
            .replace(/&#39;/g, "'") // Replace apostrophe entities
            .replace(/&lt;/g, '<') // Replace less than entities
            .replace(/&gt;/g, '>') // Replace greater than entities
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
    
    return body;
}

/**
 * Extracts plain text from HTML content
 */
export function extractPlainText(html: string): string {
    if (!html) return '';
    
    const decodedHtml = decodeHtmlEntities(html);
    
    // Remove HTML tags and decode entities
    return decodedHtml
        .replace(/<[^>]*>/g, '') // Remove all HTML tags
        .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

/**
 * Checks if content is HTML
 */
export function isHtmlContent(content: string): boolean {
    return content.includes('<html') || 
           content.includes('<div') || 
           content.includes('<p') || 
           content.includes('<br') ||
           content.includes('&lt;') ||
           content.includes('&gt;');
} 