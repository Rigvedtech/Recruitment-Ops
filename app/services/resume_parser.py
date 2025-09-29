import os
import re
from typing import Dict, Optional, Tuple
from docx import Document
from PyPDF2 import PdfReader
import spacy
from spacy.matcher import Matcher

class ResumeParser:
    def __init__(self):
        # Load English language model with fallback
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Fallback to basic English model if en_core_web_sm is not available
            try:
                self.nlp = spacy.load("en")
            except OSError:
                # If no spaCy models are available, create a basic nlp object
                self.nlp = spacy.blank("en")
        
        # Initialize matcher with patterns
        self.matcher = Matcher(self.nlp.vocab)
        
        # Add patterns for different entities
        self._add_patterns()
        
        # Common education qualifications
        self.education_keywords = [
            'B.Tech', 'B.E.', 'B.E', 'Bachelor', 'M.Tech', 'MCA', 'BCA',
            'B.Sc', 'M.Sc', 'B.Com', 'M.Com', 'PhD', 'BE', 'BTech'
        ]
        
        # Common skills
        self.tech_skills = [
            'java', 'python', 'javascript', 'react', 'angular', 'node',
            'spring', 'hibernate', 'sql', 'nosql', 'mongodb', 'aws',
            'docker', 'kubernetes', 'microservices', 'rest', 'api'
        ]

    def _add_patterns(self):
        # Experience patterns
        experience_patterns = [
            [{"TEXT": {"REGEX": "\\d+"}}, {"LOWER": {"IN": ["years", "yrs", "yr", "year"]}}],
            [{"TEXT": {"REGEX": "\\d+"}}, {"TEXT": "+"}, {"LOWER": {"IN": ["years", "yrs", "yr", "year"]}}],
            [{"TEXT": {"REGEX": "\\d+\\.\\d+"}}, {"LOWER": {"IN": ["years", "yrs", "yr", "year"]}}]
        ]
        self.matcher.add("EXPERIENCE", experience_patterns)
        
        # CTC patterns
        ctc_patterns = [
            [{"TEXT": {"REGEX": "\\d+"}}, {"LOWER": {"IN": ["lpa", "lakhs", "lacs"]}}],
            [{"TEXT": {"REGEX": "\\d+\\.\\d+"}}, {"LOWER": {"IN": ["lpa", "lakhs", "lacs"]}}],
            [{"LOWER": "rs"}, {"TEXT": "."}, {"TEXT": {"REGEX": "\\d+"}}, {"LOWER": {"IN": ["lpa", "lakhs", "lacs"]}}]
        ]
        self.matcher.add("CTC", ctc_patterns)
        
        # Notice period patterns
        notice_patterns = [
            [{"TEXT": {"REGEX": "\\d+"}}, {"LOWER": {"IN": ["days", "months", "month", "day"]}}, {"LOWER": "notice"}],
            [{"TEXT": {"REGEX": "\\d+"}}, {"LOWER": {"IN": ["days", "months", "month", "day"]}}, {"LOWER": "period"}],
            [{"LOWER": "immediate"}, {"LOWER": "joining"}]
        ]
        self.matcher.add("NOTICE_PERIOD", notice_patterns)

    def _extract_text_from_docx(self, file_path: str) -> str:
        try:
            doc = Document(file_path)
            return "\n".join([paragraph.text for paragraph in doc.paragraphs])
        except Exception as e:
            print(f"Error extracting text from DOCX: {str(e)}")
            return ""

    def _extract_text_from_pdf(self, file_path: str) -> str:
        try:
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text
        except Exception as e:
            print(f"Error extracting text from PDF: {str(e)}")
            return ""

    def _extract_education(self, text: str) -> str:
        education = []
        for edu in self.education_keywords:
            if edu.lower() in text.lower():
                # Try to get the complete education info
                pattern = rf"{edu}[^.,]*"
                matches = re.findall(pattern, text, re.IGNORECASE)
                if matches:
                    education.extend(matches)
        return ", ".join(education) if education else ""

    def _extract_skills(self, text: str) -> str:
        skills = set()
        text_lower = text.lower()
        for skill in self.tech_skills:
            if skill in text_lower:
                skills.add(skill)
        return ", ".join(sorted(skills))

    def _extract_experience(self, doc) -> str:
        matches = self.matcher(doc)
        total_exp = ""
        for match_id, start, end in matches:
            if self.nlp.vocab.strings[match_id] == "EXPERIENCE":
                span = doc[start:end]
                total_exp = span.text
                break
        return total_exp

    def _extract_ctc(self, doc) -> Tuple[str, str]:
        matches = self.matcher(doc)
        current_ctc = ""
        expected_ctc = ""
        for match_id, start, end in matches:
            if self.nlp.vocab.strings[match_id] == "CTC":
                span = doc[start:end]
                if "current" in doc[max(0, start-5):start].text.lower():
                    current_ctc = span.text
                elif "expected" in doc[max(0, start-5):start].text.lower():
                    expected_ctc = span.text
        return current_ctc, expected_ctc

    def _extract_notice_period(self, doc) -> str:
        matches = self.matcher(doc)
        notice_period = ""
        for match_id, start, end in matches:
            if self.nlp.vocab.strings[match_id] == "NOTICE_PERIOD":
                span = doc[start:end]
                notice_period = span.text
                break
        return notice_period

    def parse_resume(self, file_path: str) -> Dict[str, str]:
        """Parse resume and extract relevant information"""
        try:
            # Extract text based on file type
            if file_path.lower().endswith('.pdf'):
                text = self._extract_text_from_pdf(file_path)
            elif file_path.lower().endswith('.docx'):
                text = self._extract_text_from_docx(file_path)
            else:
                return {}

            # Process text with spaCy
            doc = self.nlp(text)

            # Extract information
            total_exp = self._extract_experience(doc)
            current_ctc, expected_ctc = self._extract_ctc(doc)
            notice_period = self._extract_notice_period(doc)
            education = self._extract_education(text)
            skills = self._extract_skills(text)

            # Return extracted information
            return {
                'total_exp': total_exp,
                'current_ctc': current_ctc,
                'expected_ctc': expected_ctc,
                'notice_period': notice_period,
                'education': education,
                'key_skills': skills
            }
        except Exception as e:
            print(f"Error parsing resume: {str(e)}")
            return {} 